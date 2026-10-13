/* eslint-disable @typescript-eslint/no-require-imports -- PGlite fixtures only; no credentials or network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('./helpers/pglite.cjs');
const sql=fs.readFileSync('docs/proposed/20261011_barcode_preservation.PROPOSED.sql','utf8');
const B='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002',L='20000000-0000-4000-8000-000000000001',L2='20000000-0000-4000-8000-000000000002',P='30000000-0000-4000-8000-000000000001',P2='30000000-0000-4000-8000-000000000002',O='40000000-0000-4000-8000-000000000001';
async function fixture(collision=false){
 const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function tenh_user_permission_allowed(uuid,uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'true')='true'$$;
 create function tenh_request_branch(uuid) returns uuid language sql as $$select nullif(current_setting('test.branch',true),'')::uuid$$;
 create function tenh_assert_effective_permission(uuid,text) returns void language plpgsql as $$begin if auth.uid() is null or not public.tenh_user_permission_allowed($1,auth.uid(),$2) then raise exception 'Denied' using errcode='42501';end if;end$$;
 create function tenh_receive_all_online_orders(uuid) returns boolean language sql as $$select coalesce(current_setting('test.online',true),'false')='true'$$;
 create table businesses(id uuid primary key);create table business_locations(id uuid primary key,business_id uuid references businesses,is_active boolean default true,plan_disable_pending boolean default false);
 create table products(id uuid primary key default gen_random_uuid(),business_id uuid references businesses,sku text,barcode text,name text);
 create table branch_product_details(id uuid references products,business_id uuid references businesses,location_id uuid references business_locations,sku text,barcode text,branch_archived boolean default false,is_active boolean default true,primary key(id,location_id),name text default 'Fixture',category_id uuid,description text,size text,color text,cost_price numeric default 0,selling_price numeric default 1,low_stock_quantity integer default 0,is_online boolean default false,image_url text,image_urls text[],variant_image_url text,updated_at timestamptz default now());
 create view branch_products as select d.*, 'standard'::text product_type,null::uuid variant_group_id from branch_product_details d where location_id=public.tenh_request_branch(business_id);
 create table orders(id uuid primary key default gen_random_uuid(),business_id uuid references businesses,location_id uuid references business_locations,order_code text unique,order_number text,archived_at timestamptz,order_source text default 'pos');
 insert into businesses values('${B}'),('${OTHER}');insert into business_locations(id,business_id)values('${L}','${B}'),('${L2}','${B}');
 insert into products values('${P}','${B}','LEGACY_SKU','000abc_1','Legacy'),('${P2}','${B}','SECOND','${collision?'LEGACY_SKU':' padded '}','Padded');
 insert into branch_product_details(id,business_id,location_id,sku,barcode)values('${P}','${B}','${L}','LEGACY_SKU','000abc_1'),('${P2}','${B}','${L}','SECOND',' padded '),('${P}','${B}','${L2}','OTHER_BRANCH','000009');
 insert into orders(id,business_id,location_id,order_code,order_number)values('${O}','${B}','${L}','123456789012','POS-ABC001');
 select set_config('test.uid','90000000-0000-4000-8000-000000000001',false),set_config('test.branch','${L}',false);
 `);await db.exec(fs.readFileSync('docs/proposed/20261005_edit_product_rows_v2.PROPOSED.sql','utf8'));return db;
}
test('unapplied proposal compiles and preserves exact legacy identifiers, aliases, collisions and authorization',async()=>{
 const db=await fixture();try{
  const before=(await db.query('select id,barcode,sku from products order by id')).rows;await db.exec(sql);
  assert.deepEqual((await db.query('select id,barcode,sku from products order by id')).rows,before);
  assert.equal((await db.query('select tenh_barcode_contract_ready() ready')).rows[0].ready,true);
  // Execute the actual reviewed batch-edit function after the proposal patches it.
  for(const value of [' padded ','',null]){
   await db.exec(`alter table branch_product_details disable trigger all;update branch_product_details set barcode=${value===null?'null':"'"+value+"'"} where id='${P2}';alter table branch_product_details enable trigger all;`);
   const row=(await db.query(`select * from branch_products where id='${P2}'`)).rows[0];
   const payload=[{id:P2,expectedUpdatedAt:row.updated_at,values:{name:'Renamed legacy',category_id:null,description:null,sku:'SECOND',size:null,color:null,cost_price:0,selling_price:1,low_stock_quantity:0,is_active:true,is_online:false}}];
   const result=await db.query('select tenh_edit_product_rows($1,$2,$3,$4) result',[B,L,P2,JSON.stringify(payload)]);assert.equal(result.rows[0].result.success,true);
   assert.equal((await db.query(`select barcode from branch_products where id='${P2}'`)).rows[0].barcode,value);
  }
  await db.exec(`alter table branch_product_details disable trigger all;update branch_product_details set barcode=' padded ' where id='${P2}';alter table branch_product_details enable trigger all;`);
  await db.exec(`update products set name='Renamed' where id='${P2}';update branch_product_details set sku='~tenh-edit-${P2}',barcode=null where id='${P2}';update branch_product_details set sku='SECOND',barcode=' padded ' where id='${P2}';`);
  assert.equal((await db.query(`select barcode from branch_product_details where id='${P2}'`)).rows[0].barcode,' padded ');
  await assert.rejects(db.query(`update products set barcode=' trimmed ' where id='${P}'`),/exact printable/);
  await assert.rejects(db.query(`update products set barcode='second' where id='${P}'`),/reserved/);
  await assert.rejects(db.query(`insert into products(business_id,sku,barcode)values('${B}','~tenh-edit-user','SECOND')`),/reserved/);
  await db.query(`update products set barcode='000007' where id='${P}'`);
  assert.deepEqual((await db.query(`select * from tenh_scan_product_ids('${B}','000abc_1')`)).rows,[{product_id:P}]);
  assert.equal((await db.query(`select * from tenh_scan_product_ids('${B}','7')`)).rows.length,0);
  assert.equal((await db.query(`select * from tenh_scan_product_ids('${B}','000009')`)).rows.length,0);
  assert.equal((await db.query(`select * from tenh_scan_product_ids('${OTHER}','000abc_1')`)).rows.length,0);
  await db.query(`insert into products(business_id,sku,barcode)values('${B}','NEW',null)`);const generated=(await db.query("select barcode from products where sku='NEW'")).rows[0].barcode;assert.match(generated,/^\d{15}$/);
  assert.deepEqual((await db.query(`select * from tenh_scan_order_ids('${B}','POS-ABC001')`)).rows,[{order_id:O}]);
  await db.exec(`select set_config('test.branch','${L2}',false)`);assert.equal((await db.query(`select * from tenh_scan_order_ids('${B}','123456789012')`)).rows.length,0);
  await db.exec(`update orders set order_source='online' where id='${O}';select set_config('test.online','true',false)`);assert.equal((await db.query(`select * from tenh_scan_order_ids('${B}','123456789012')`)).rows.length,1);
  await db.exec(`update orders set archived_at=now() where id='${O}'`);assert.equal((await db.query(`select * from tenh_scan_order_ids('${B}','123456789012')`)).rows.length,0);
  await db.exec("select set_config('test.allowed','false',false)");await assert.rejects(db.query(`select * from tenh_scan_product_ids('${B}','000007')`),/denied/);await assert.rejects(db.query(`select * from tenh_scan_order_ids('${B}','123456789012')`),/Denied/);
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from tenh_product_identifiers'),/permission denied/);await db.exec('reset role;set role anon');await assert.rejects(db.query(`select * from tenh_scan_order_ids('${B}','123456789012')`),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
test('existing product/SKU collisions abort the entire proposal without changing saved columns',async()=>{
 const db=await fixture(true);try{await assert.rejects(db.exec(sql),/reserved/);await db.exec('rollback');assert.equal((await db.query("select to_regclass('public.tenh_product_identifiers') registry")).rows[0].registry,null);assert.equal((await db.query(`select barcode from products where id='${P2}'`)).rows[0].barcode,'LEGACY_SKU');}finally{await db.close();}
});
