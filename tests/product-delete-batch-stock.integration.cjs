// Disposable PostgreSQL/PGlite schema only; never reads credentials or a DB URL.
// Run with TENH_PGLITE_PATH set to a separately installed @electric-sql/pglite.
const { PGlite } = require('./helpers/pglite.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
(async () => {
 const db = new PGlite();
 try {
 const [business, branch, other, user] = [1,2,3,4].map(id);
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;`);
 const wanted = new Set(['businesses','business_locations','products','product_location_stock','stock_adjustments','categories']);
 for (const table of JSON.parse(fs.readFileSync('tests/fixtures/branch-catalog-tables.json','utf8')).filter(t => wanted.has(t.name))) {
   await db.exec(`create table public.${table.name}(${table.columns});`);
   if (table.columns.startsWith('id uuid,')) await db.exec(`alter table ${table.name} add primary key(id); alter table ${table.name} alter column id set default gen_random_uuid();`);
 }
 await db.exec(`alter table product_location_stock add primary key(location_id,product_id);
 create function tenh_request_branch(uuid) returns uuid language sql as $$select current_setting('test.branch')::uuid$$;
 create function tenh_branch_setting_visible(uuid,uuid) returns boolean language sql as $$select $1='${business}'::uuid and $2=current_setting('test.branch')::uuid$$;
 create function tenh_user_permission_allowed(uuid,uuid,text) returns boolean language sql as $$select $1='${business}'::uuid and current_setting('test.denied',true) is distinct from $3$$;
 create function tenh_assert_effective_permission(uuid,text) returns void language plpgsql as $$begin if not tenh_user_permission_allowed($1,auth.uid(),$2) then raise exception 'Denied';end if;end$$;
 create function tenh_assert_plan_branch(uuid,uuid) returns void language plpgsql as $$begin perform 1 from businesses where id=$1 for update; if not exists(select 1 from business_locations where id=$2 and business_id=$1 and is_active) then raise exception 'Inactive branch';end if;end$$;
 insert into businesses(id,name,is_active) values('${business}','Test',true);
 insert into business_locations(id,business_id,name,is_active,plan_disable_pending) values('${branch}','${business}','Main',true,false),('${other}','${business}','Other',true,false);
 select set_config('test.branch','${branch}',false);
 create table test_sale_history(product_id uuid references products(id),product_name text);`);
 await db.exec(fs.readFileSync('supabase/migrations/20260924009000_safe_stock_adjustment.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260924012000_branch_product_details.sql','utf8'));
 // The exact first block of the existing catalog guard migration. Other blocks
 // in that migration depend on online checkout/bundles outside this fixture.
 const guards = fs.readFileSync('supabase/migrations/20260924019000_branch_stock_catalog_guards.sql','utf8');
 await db.exec(guards.slice(0, guards.indexOf(" select pg_get_functiondef('public.tenh_choose_online_branch")) + 'end$$; commit;');
 await db.exec(fs.readFileSync('supabase/migrations/20260929001000_product_delete_and_batch_stock.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20260930003000_product_galleries.sql','utf8'));
 const seed=async(n,mainStock,otherStock=0)=>{
   await db.query('insert into products(id,business_id,owner_id,name,sku,stock_quantity,cost_price,selling_price,is_active,is_pos,is_online,product_type,low_stock_quantity) values($1,$2,$3,$4,$5,$6,2,10,true,true,true,\'variant\',1)',[id(n),business,user,'Product '+n,'SKU-'+n,mainStock+otherStock]);
   await db.query('insert into product_location_stock(business_id,location_id,product_id,quantity) values($1,$2,$3,$4)',[business,branch,id(n),mainStock]);
   if(otherStock)await db.query('insert into product_location_stock(business_id,location_id,product_id,quantity) values($1,$2,$3,$4)',[business,other,id(n),otherStock]);
 };
 await seed(11,7,3);
  await db.query('update branch_products set image_urls=$1 where id=$2', [['https://images.test/one.jpg','https://images.test/two.jpg'],id(11)]);
  assert.deepEqual((await db.query('select image_urls from branch_products where id=$1',[id(11)])).rows[0].image_urls,['https://images.test/one.jpg','https://images.test/two.jpg']);
  assert.deepEqual((await db.query('select image_urls from branch_product_details where id=$1 and location_id=$2',[id(11),other])).rows[0].image_urls,[]);
  await assert.rejects(db.query('update branch_products set image_urls=$1 where id=$2',[Array(9).fill('x'),id(11)]));await seed(12,5);await seed(13,1);
 await db.query('insert into test_sale_history values($1,$2)',[id(11),'Historical name']);
 const quantity=async(n,location=branch)=>(await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[id(n),location])).rows[0].quantity;
 const count=async table=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
 await db.exec('grant usage on schema public,auth to authenticated;grant select on products,product_location_stock to authenticated;');
 await db.exec(`select set_config('test.denied','products.stock_adjust',false);set role authenticated;`);
 await db.query('delete from branch_products where id=$1',[id(11)]);
 await db.exec("reset role;select set_config('test.denied','',false)");
 assert.equal(await quantity(11),0);assert.equal(await quantity(11,other),3);
 assert.equal((await db.query('select stock_quantity,is_active from products where id=$1',[id(11)])).rows[0].stock_quantity,3);
 assert.equal((await db.query('select is_active from products where id=$1',[id(11)])).rows[0].is_active,true);
 assert.equal(await count('test_sale_history'),1);assert.equal(await count('stock_adjustments'),1);
 assert.equal((await db.query('select stock_before,stock_after from stock_adjustments')).rows[0].stock_before,7);
 // A ledger error must roll back every row of the same DELETE statement.
 await db.exec(`create function test_ledger_failure() returns trigger language plpgsql as $$begin if new.product_id='${id(13)}'::uuid then raise exception 'Test ledger unavailable';end if;return new;end$$;
 create trigger test_ledger_failure before insert on stock_adjustments for each row execute function test_ledger_failure();`);
 await assert.rejects(db.query('delete from branch_products where id=any($1::uuid[])',[[id(12),id(13)]]),/Test ledger unavailable/);
 assert.equal(await quantity(12),5);assert.equal(await quantity(13),1);assert.equal(await count('stock_adjustments'),1);
 await db.exec('drop trigger test_ledger_failure on stock_adjustments;');
 await db.query('delete from branch_products where id=$1',[id(12)]);
 assert.equal(await quantity(12),0);assert.equal((await db.query('select is_active,is_online from products where id=$1',[id(12)])).rows[0].is_online,false);
 assert.equal((await db.query('select count(*)::int n from branch_products where id=$1',[id(12)])).rows[0].n,0);
 await seed(14,8);await seed(15,3);
 const row=(n,mode,qty,expected)=>({productId:id(n),mode,quantity:qty,expectedQuantity:expected});
 const batch=(items,request=80,location=branch)=>db.query('select tenh_adjust_branch_stock_batch($1,$2,$3,$4,$5,$6) result',[business,location,items,'Count correction',null,id(request)]);
 const ledgerBefore=await count('stock_adjustments');
 await assert.rejects(batch([row(14,'increase',2,8),row(15,'decrease',99,3)]),/Not enough/);
 assert.equal(await quantity(14),8);assert.equal(await quantity(15),3);assert.equal(await count('stock_adjustments'),ledgerBefore);assert.equal(await count('stock_adjustment_requests'),0);
 await assert.rejects(batch([row(14,'increase',2,8),row(15,'set',1,2)]),/Stock changed/);
 assert.equal(await quantity(14),8);assert.equal(await count('stock_adjustment_requests'),0);
 const items=[row(14,'increase',2,8),row(15,'decrease',2,3)];
 const first=await batch(items);assert.equal(first.rows[0].result.count,2);assert.equal(await quantity(14),10);assert.equal(await quantity(15),1);
 assert.deepEqual((await batch(items)).rows,first.rows);assert.equal(await quantity(14),10);assert.equal(await count('stock_adjustments'),ledgerBefore+2);assert.equal(await count('stock_adjustment_requests'),3);
 await assert.rejects(batch([row(14,'increase',3,8),row(15,'decrease',2,3)]),/different details/);
 await assert.rejects(batch([row(14,'increase',1,10),row(14,'set',2,10)],81),/only once/);
 await assert.rejects(batch([row(14,'increase',1,10)],82,other),/operating branch/);
 await db.exec("select set_config('test.denied','products.stock_adjust',false)");
 await assert.rejects(batch([row(14,'increase',1,10)],83),/Denied/);
 await db.exec("select set_config('test.denied','products.disable',false)");
 await assert.rejects(db.query('delete from branch_products where id=$1',[id(13)]),/Denied/);assert.equal(await quantity(13),1);
 await db.exec("select set_config('test.denied','',false)");
 await db.query('update branch_product_details set is_active=false where id=$1 and location_id=$2',[id(15),branch]);
 await assert.rejects(batch([row(14,'increase',1,10),row(15,'increase',1,1)],84),/unavailable in this branch/);assert.equal(await quantity(14),10);
 await db.exec('set role anon');await assert.rejects(batch(items,85),/permission denied/);await db.exec('reset role');
 console.log('PASS: branch-local deletion/ledger/history, statement rollback, batch rollback, stale counts, retry identity, scope and permission assertions. Disposable fixture only, not live Supabase.');
 } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
