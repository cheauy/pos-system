const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const B='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002',A='20000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000002',U='30000000-0000-4000-8000-000000000001',CAT='40000000-0000-4000-8000-000000000001';
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function tenh_current_user_permission_allowed(b uuid,p text) returns boolean language sql as $$select b='${B}'::uuid and auth.uid()='${U}'::uuid and current_setting('test.allowed',true)='yes'$$;
 create function tenh_request_branch(b uuid) returns uuid language sql as $$select '${A}'::uuid$$;
 create table suppliers(id uuid primary key,business_id uuid,location_id uuid,name text,contact_person text,phone text,email text,address text,notes text,is_active boolean,created_at timestamptz);
 create table purchase_orders(id uuid primary key,business_id uuid,location_id uuid,supplier_id uuid,supplier_name text,po_number text,reference_number text,status text,order_date date,expected_date date,notes text,subtotal numeric,total numeric,created_by uuid,created_at timestamptz);
 create table purchase_order_items(id uuid primary key,business_id uuid,purchase_order_id uuid,product_name text,sku text,ordered_quantity integer,received_quantity integer,unit_cost numeric,created_at timestamptz);
 create table profiles(id uuid primary key,full_name text);
 create table categories(id uuid primary key,business_id uuid,branch_ids uuid[]);
 create table branch_product_rows(id uuid primary key,business_id uuid,location_id uuid,variant_group_id uuid,category_id uuid);
 grant usage on schema auth to authenticated;
 grant select on all tables in schema public to authenticated;
 set test.uid='${U}';set test.allowed='yes';`);
 for(const table of ['suppliers','purchase_orders','purchase_order_items','categories','branch_product_rows']){
  await db.exec(`alter table ${table} enable row level security; create policy tenant on ${table} for select to authenticated using(business_id='${B}'::uuid);`);
 }
 await db.exec(`create view branch_products with(security_invoker=true) as select id,business_id,variant_group_id,category_id from branch_product_rows where location_id='${A}'::uuid;grant select on branch_products to authenticated;`);
 const migration=fs.readFileSync('supabase/migrations/20261001001000_bounded_management_reads.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 await db.exec(`insert into suppliers(id,business_id,location_id,name,is_active,created_at)
 select gen_random_uuid(),'${B}','${A}','Supplier '||n,true,now()-n*interval '1 minute' from generate_series(1,31)n;
 insert into purchase_orders(id,business_id,location_id,supplier_id,supplier_name,po_number,status,order_date,total,created_at)
 select gen_random_uuid(),'${B}','${A}',(select id from suppliers order by created_at desc limit 1),'Supplier 1','PO-'||n,case when n=31 then 'received' else 'draft' end,current_date,10,now()-n*interval '1 minute' from generate_series(1,31)n;
 insert into purchase_orders(id,business_id,location_id,po_number,status,total) values(gen_random_uuid(),'${B}','${C}','HIDDEN-BRANCH','draft',999),(gen_random_uuid(),'${OTHER}','${A}','HIDDEN-TENANT','draft',999);
 insert into purchase_order_items values(gen_random_uuid(),'${B}',(select id from purchase_orders where po_number='PO-1'),'Shirt',null,5,2,10,now());
 insert into categories values('${CAT}','${B}',null);
 insert into branch_product_rows select gen_random_uuid(),'${B}','${A}','${U}','${CAT}' from generate_series(1,20);
 insert into branch_product_rows values(gen_random_uuid(),'${B}','${A}',null,'${CAT}'),(gen_random_uuid(),'${B}','${C}',null,'${CAT}');
 set role authenticated;`);
 const po=async(page=1,query='',status='all')=>(await db.query('select tenh_purchase_orders_page($1,$2,$3,$4) data',[B,page,query,status])).rows[0].data;
 const first=await po();assert.equal(first.orders.length,15);assert.equal(first.total,31);assert.equal(first.stats.outstanding,300);assert.equal(first.orders[0].ordered_quantity,5);assert.equal(first.orders[0].items.length,1);
 const second=await po(2);assert.equal(second.orders.length,15);assert.ok(!second.orders.some(x=>first.orders.some(y=>y.id===x.id)));
 assert.equal((await po(99)).page,3);assert.equal((await po(3)).orders.length,1);
 assert.equal((await po(1,'PO-31')).orders[0].po_number,'PO-31');assert.equal((await po(1,'','received')).total,1);
 assert.equal((await po(1,"%' OR true --")).total,0);
 const suppliers=(await db.query('select tenh_suppliers_page($1,1) data',[B])).rows[0].data;
 assert.equal(suppliers.suppliers.length,15);assert.equal(suppliers.total,31);assert.equal(suppliers.stats.openPoValue,300);
 assert.equal(Object.values(suppliers.metrics).find(m=>m.orderCount>0).orderCount,31);
 assert.equal((await db.query("select tenh_suppliers_page($1,1,'Supplier 31') data",[B])).rows[0].data.total,1);
 assert.equal((await db.query('select * from tenh_category_product_counts($1,$2,$3)',[B,A,[CAT]])).rows[0].product_count,2);
 await assert.rejects(db.query('select * from tenh_category_product_counts($1,$2,$3)',[B,C,[CAT]]),/branch changed/);
 await assert.rejects(db.query('select * from tenh_category_product_counts($1,$2,$3)',[B,A,Array(11).fill(CAT)]),/at most 10/);
 await assert.rejects(db.query('select tenh_suppliers_page($1)',[OTHER]),/permission/);
 await db.exec("set test.allowed='no'");await assert.rejects(po(),/permission/);
 await db.exec("reset role;set role anon");await assert.rejects(po(),/permission denied/);
 console.log('PASS: bounded pages, complete search/totals, item quantities, distinct variant counts, RLS, branch isolation, permission denial, anonymous denial and repeatable migration.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
