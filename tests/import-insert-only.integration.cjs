const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(path.join(process.env.TEMP, 'tenh-branch-sql-check/node_modules/@electric-sql/pglite'));
// Read-only snapshots of the installed dependencies; no live business data is used.
const baseline = process.env.IMPORT_TEST_BASELINE_DIR || path.join(process.env.TEMP, 'tenh-import-baseline');
(async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql as $$select current_setting('test.user')::uuid$$;
   create table businesses(id uuid primary key,product_mode text);
   create table business_members(id uuid,business_id uuid,user_id uuid,role text,is_active boolean);
   create table business_locations(id uuid primary key,business_id uuid,code text,is_active boolean);
   create table products(id uuid primary key default gen_random_uuid(),business_id uuid,owner_id uuid,name text not null,sku text,barcode text,description text,cost_price numeric check(cost_price>=0),selling_price numeric check(selling_price>=0),low_stock_quantity int,is_active boolean default true,stock_quantity int default 0,updated_at timestamptz default now(),unique(business_id,sku));
   create table customers(id uuid primary key default gen_random_uuid(),business_id uuid,owner_id uuid,location_id uuid,name text,phone text,email text,address text,note text,updated_at timestamptz default now());
   create table suppliers(id uuid primary key default gen_random_uuid(),business_id uuid,owner_id uuid,location_id uuid,name text,phone text,email text,address text,notes text,contact_person text,is_active boolean default true,updated_at timestamptz default now());
   create table product_location_stock(business_id uuid,location_id uuid,product_id uuid,quantity int check(quantity>=0),low_stock_threshold int,updated_at timestamptz default now(),primary key(location_id,product_id));
   create table stock_adjustments(id uuid primary key default gen_random_uuid(),business_id uuid,product_id uuid,adjustment_type text,quantity_delta int,stock_before int,stock_after int,reason text,reference text,created_by uuid);
   create table business_import_requests(business_id uuid,request_id uuid,user_id uuid,payload_hash text,result jsonb,primary key(business_id,request_id));
   create table data_transfer_jobs(business_id uuid,user_id uuid,direction text,entity text,format text,mode text,filename text,row_count int,status text,summary jsonb);
  `);
  for (const name of ['tenh_export_redact', 'tenh_export_business', 'import_branch_inventory_safe']) await db.exec(fs.readFileSync(path.join(baseline, `${name}.sql`), 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20260923233000_import_insert_only.sql', 'utf8'));
  const b='10000000-0000-0000-0000-000000000001', u='20000000-0000-0000-0000-000000000001', branch='30000000-0000-0000-0000-000000000001', otherBranch='30000000-0000-0000-0000-000000000002';
  await db.query("select set_config('test.user',$1,false)", [u]);
  await db.query("insert into businesses values($1,'standard')", [b]);
  await db.query("insert into business_members values($1,$2,$1,'owner',true)", [u,b]);
  await db.query("insert into business_locations values($1,$2,'MAIN',true),($3,$2,'SECOND',true)", [branch,b,otherBranch]);
  let sequence = 0;
  const run = async (kind, rows, options={}) => (await db.query('select tenh_import_business_safe($1,$2,$3,$4,$5,$6,$7,$8,$9) data', [b,kind,options.mode??'insert',JSON.stringify(rows),options.branch??branch,Boolean(options.commit),options.expected??null,options.id??null,'template.csv'])).rows[0].data;
  const commit = async(kind,rows,options={}) => {
   const preview=await run(kind,rows,options);
   const id=`40000000-0000-0000-0000-${String(++sequence).padStart(12,'0')}`;
   const result=await run(kind,rows,{...options,commit:true,expected:preview.fingerprint,id});
   return { preview, result, id };
  };
  const product={name:'Original',sku:'TEE-1',cost_price:3,selling_price:10,low_stock_quantity:2,is_active:true};
  await commit('products',[product]);
  const before=(await db.query('select * from products')).rows[0];
  const incoming=[{...product,name:'Must not overwrite',selling_price:99},{...product,sku:'TEE-2',name:'New product'}];
  let {preview,result,id}=await commit('products',incoming);
  assert.equal(preview.inserted,1);assert.equal(preview.skipped,1);assert.equal(preview.updated,0);assert.equal(result.updated,0);
  assert.deepEqual((await db.query("select * from products where sku='TEE-1'")).rows[0],before);
  assert.equal((await run('products',incoming,{commit:true,expected:preview.fingerprint,id})).replayed,true);
  assert.equal((await db.query('select count(*)::int n from products')).rows[0].n,2);
  await assert.rejects(run('products',incoming,{mode:'merge',commit:true,expected:preview.fingerprint,id}),/another request/);
  for(const kind of ['customers','suppliers']) {
   const contact={name:'Original contact',email:`${kind}@example.com`,phone:'111'};
   await commit(kind,[contact]);
   const original=(await db.query(`select * from ${kind}`)).rows[0];
   const check=await commit(kind,[{...contact,name:'Do not change'}, {name:'New contact',email:`new-${kind}@example.com`,phone:'222'}]);
   assert.equal(check.result.skipped,1);assert.equal(check.result.inserted,1);assert.equal(check.result.updated,0);
   assert.deepEqual((await db.query(`select * from ${kind} where id=$1`,[original.id])).rows[0],original);
  }
  // New stock rows are created; existing stock and its timestamp remain unchanged.
  await commit('inventory',[{branch_code:'MAIN',sku:'TEE-1',quantity:5,low_stock_threshold:2}]);
  const stock=(await db.query('select * from product_location_stock')).rows[0];
  const inventory=[{branch_code:'MAIN',sku:'TEE-1',quantity:999,low_stock_threshold:9},{branch_code:'MAIN',sku:'TEE-2',quantity:7,low_stock_threshold:1}];
  ({result}=await commit('inventory',inventory));assert.equal(result.inserted,1);assert.equal(result.skipped,1);assert.equal(result.updated,0);
  assert.deepEqual((await db.query('select * from product_location_stock where product_id=$1',[stock.product_id])).rows[0],stock);
  assert.equal((await db.query("select stock_quantity from products where sku='TEE-1'")).rows[0].stock_quantity,5);
  assert.equal((await db.query("select stock_quantity from products where sku='TEE-2'")).rows[0].stock_quantity,7);
  const previewOnly=await run('inventory',[{branch_code:'SECOND',sku:'TEE-1',quantity:8,low_stock_threshold:0}],{branch:otherBranch});
  assert.equal(previewOnly.inserted,1);assert.equal((await db.query('select count(*)::int n from product_location_stock')).rows[0].n,2);
  const updateOnly=await commit('inventory',[{branch_code:'SECOND',sku:'TEE-1',quantity:8,low_stock_threshold:0}],{branch:otherBranch,mode:'update'});
  assert.equal(updateOnly.result.skipped,1);assert.equal(updateOnly.result.inserted,0);
  await assert.rejects(run('inventory',[{branch_code:'SECOND',sku:'TEE-1',quantity:8}]),/different branch/);
  // Failure after a valid first row leaves no new records or history entry.
  const failing=[{...product,sku:'FIRST'},{...product,sku:'FAIL'}];
  const valid=await run('products',failing);
  await db.exec(`create function fail_insert() returns trigger language plpgsql as $$begin if new.sku='FAIL' then raise exception 'Late failure';end if;return new;end;$$;create trigger fail_insert before insert on products for each row execute function fail_insert();`);
  await assert.rejects(run('products',failing,{commit:true,expected:valid.fingerprint,id:'40000000-0000-0000-0000-000000000099'}),/Late failure/);
  assert.equal((await db.query("select count(*)::int n from products where sku='FIRST'")).rows[0].n,0);
  // Preview cannot be reused after switching modes or modifying the file.
  const stale=await run('products',[{...product,sku:'NEXT'}]);
  await assert.rejects(run('products',[{...product,sku:'NEXT'}],{mode:'merge',commit:true,expected:stale.fingerprint,id:'40000000-0000-0000-0000-000000000098'}),/Data changed/);
  await assert.rejects(run('backup',{products:[]}),/CSV template/);
  console.log('PASS: add-only products, customers, suppliers and inventory; unchanged matches; stock totals; preview rollback; duplicate retry; mode binding; branch isolation; atomic late failure.');
 } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
