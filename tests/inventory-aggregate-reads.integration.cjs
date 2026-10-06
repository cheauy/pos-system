const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const B='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002',A='20000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000002',U='30000000-0000-4000-8000-000000000001',CAT='40000000-0000-4000-8000-000000000001',P1='50000000-0000-4000-8000-000000000001',P2='50000000-0000-4000-8000-000000000002';
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function tenh_current_user_permission_allowed(b uuid,p text) returns boolean language sql as $$select b='${B}'::uuid and auth.uid()='${U}'::uuid and current_setting('test.allowed',true)='yes'$$;
 create function tenh_request_branch(b uuid) returns uuid language sql as $$select nullif(current_setting('test.branch',true),'')::uuid$$;
 create table products(id uuid primary key,business_id uuid,category_id uuid);
 create table orders(id uuid primary key,business_id uuid,location_id uuid,status text,created_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid,product_id uuid,quantity numeric);
 grant usage on schema auth to authenticated;
 grant select on all tables in schema public to authenticated;
 set test.uid='${U}';set test.allowed='yes';set test.branch='${A}';`);
 for(const table of ['products','orders']){
  await db.exec(`alter table ${table} enable row level security; create policy tenant on ${table} for select to authenticated using(business_id='${B}'::uuid);`);
 }
 const migration=fs.readFileSync('supabase/migrations/20261007002000_inventory_aggregate_reads.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 await db.exec(`insert into products values('${P1}','${B}','${CAT}'),('${P2}','${B}',null),(gen_random_uuid(),'${B}','${CAT}'),(gen_random_uuid(),'${OTHER}','${CAT}');
 insert into orders values
  ('60000000-0000-4000-8000-000000000001','${B}','${A}','completed',now()-interval '1 day'),
  ('60000000-0000-4000-8000-000000000002','${B}','${A}','completed',now()-interval '40 days'),
  ('60000000-0000-4000-8000-000000000003','${B}','${A}','cancelled',now()),
  ('60000000-0000-4000-8000-000000000004','${B}','${C}','completed',now()),
  ('60000000-0000-4000-8000-000000000005','${OTHER}','${A}','completed',now());
 insert into order_items values
  (gen_random_uuid(),'60000000-0000-4000-8000-000000000001','${P1}',3),
  (gen_random_uuid(),'60000000-0000-4000-8000-000000000001','${P1}',2),
  (gen_random_uuid(),'60000000-0000-4000-8000-000000000001','${P2}',-4),
  (gen_random_uuid(),'60000000-0000-4000-8000-000000000001',null,9),
  (gen_random_uuid(),'60000000-0000-4000-8000-000000000002','${P1}',100),
  (gen_random_uuid(),'60000000-0000-4000-8000-000000000003','${P1}',100),
  (gen_random_uuid(),'60000000-0000-4000-8000-000000000004','${P1}',100),
  (gen_random_uuid(),'60000000-0000-4000-8000-000000000005','${P1}',100);
 set role authenticated;`);
 const totals=(await db.query('select tenh_category_product_totals($1) data',[B])).rows[0].data;
 assert.deepEqual(totals,{total:3,counts:{[CAT]:2}});
 const since=new Date(Date.now()-30*864e5).toISOString();
 const sold=(await db.query('select product_id,quantity::float8 q from tenh_branch_units_sold($1,$2) order by product_id',[B,since])).rows;
 assert.deepEqual(sold,[{product_id:P1,q:5},{product_id:P2,q:0}]);
 await db.exec("set test.branch=''");await assert.rejects(db.query('select * from tenh_branch_units_sold($1,$2)',[B,since]),/active branch/);
 await assert.rejects(db.query('select tenh_category_product_totals($1)',[OTHER]),/permission/);
 await db.exec("set test.allowed='no'");
 await assert.rejects(db.query('select tenh_category_product_totals($1)',[B]),/permission/);
 await assert.rejects(db.query('select * from tenh_branch_units_sold($1,$2)',[B,since]),/permission/);
 await db.exec("reset role;set role anon");await assert.rejects(db.query('select tenh_category_product_totals($1)',[B]),/permission denied/);
 console.log('PASS: category totals, branch 30-day completed units (window, status, branch, tenant, negative/null lines), permission and anonymous denial, repeatable migration.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
