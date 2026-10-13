/* eslint-disable @typescript-eslint/no-require-imports -- PGlite fixtures only; no credentials or network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('./helpers/pglite.cjs');
const sql=fs.readFileSync('docs/proposed/20261012_barcode_preservation_v2.PROPOSED.sql','utf8');
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

 `);
 await db.exec(`
 create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
 alter view branch_products set(security_invoker=true);
 create table product_location_stock(product_id uuid references products,business_id uuid references businesses,location_id uuid references business_locations,quantity integer default 0,low_stock_threshold integer default 0,primary key(product_id,location_id));
 create table branch_receipt_settings(id uuid);create table branch_customer_settings(id uuid);create table branch_pos_settings(id uuid);
 create table business_members(business_id uuid,user_id uuid,role text,is_active boolean);
 insert into business_members values('${B}','90000000-0000-4000-8000-000000000001','owner',true);
 create table business_import_requests(business_id uuid,request_id uuid,user_id uuid,payload_hash text,result jsonb);
 create table data_transfer_jobs(business_id uuid,user_id uuid,direction text,entity text,format text,mode text,filename text,row_count integer,status text,summary jsonb);
 alter table products add column owner_id uuid,add column description text,add column cost_price numeric default 0,add column selling_price numeric default 1,add column low_stock_quantity integer default 0,add column is_active boolean default true,add column stock_quantity integer default 0,add column updated_at timestamptz default now();
 create function tenh_assert_plan_branch(uuid,uuid) returns void language sql as $$select$$;
 -- Synthetic view implementation; deployed branch/auth bodies need separate review.
 create function tenh_write_branch_product() returns trigger language plpgsql security definer set search_path='' as $$
 begin
   perform public.tenh_assert_effective_permission(old.business_id,'products.update');
   update public.branch_product_details set name=new.name,sku=new.sku,barcode=new.barcode,category_id=new.category_id,description=new.description,size=new.size,color=new.color,cost_price=new.cost_price,selling_price=new.selling_price,low_stock_quantity=new.low_stock_quantity,is_active=new.is_active,is_online=new.is_online,image_url=new.image_url,image_urls=new.image_urls,variant_image_url=new.variant_image_url,updated_at=now()
     where id=old.id and business_id=old.business_id and location_id=public.tenh_request_branch(old.business_id);
   new.updated_at:=now();return new;
 end $$;
 create trigger branch_product_write instead of update or delete on branch_products for each row execute function tenh_write_branch_product();
 create function tenh_seed_branch_product() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.branch_product_details(id,business_id,location_id,sku,barcode)select p.id,p.business_id,new.location_id,p.sku,p.barcode from public.products p where p.id=new.product_id and p.business_id=new.business_id on conflict do nothing;return new;end $$;
 create trigger tenh_seed_branch_product after insert on product_location_stock for each row execute function tenh_seed_branch_product();
 create function tenh_export_business(uuid,text[]) returns jsonb language sql as $$
 select jsonb_build_object('products',(select coalesce(jsonb_agg(to_jsonb(p)),'[]')from public.branch_products p where p.business_id=$1),'business_locations','[]'::jsonb)$$;
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20260930003000_order_code.sql','utf8'));
 const importSource=fs.readFileSync('supabase/migrations/20260924018000_branch_import_scope.sql','utf8');
 const delimiter=String.fromCharCode(36)+'function'+String.fromCharCode(36);
 const first=importSource.indexOf('CREATE OR REPLACE FUNCTION'),body=importSource.indexOf(delimiter,first),last=importSource.indexOf(delimiter,body+delimiter.length)+delimiter.length;
 await db.exec(importSource.slice(first,last)+';');
 await db.exec('revoke all on function tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text) from public,anon,service_role;grant execute on function tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text) to authenticated');
 await db.exec(fs.readFileSync('docs/proposed/20261005_edit_product_rows_v2.PROPOSED.sql','utf8'));return db;
}
test('v2 unapplied proposal compiles and preserves exact legacy identifiers, aliases, collisions and authorization',async()=>{
 const db=await fixture();try{
  const before=(await db.query('select id,barcode,sku from products order by id')).rows;await db.exec(sql);
  assert.deepEqual((await db.query('select id,barcode,sku from products order by id')).rows,before);
  assert.equal((await db.query('select tenh_barcode_contract_v2_ready() ready')).rows[0].ready,true);
  // Execute the actual reviewed batch-edit function after the proposal patches it.
  for(const value of [' padded ','',null]){
   await db.exec(`alter table branch_product_details disable trigger all;update branch_product_details set barcode=${value===null?'null':"'"+value+"'"} where id='${P2}';alter table branch_product_details enable trigger all;`);
   const row=(await db.query(`select * from branch_products where id='${P2}'`)).rows[0];
   const payload=[{id:P2,expectedUpdatedAt:row.updated_at,values:{name:'Renamed legacy',category_id:null,description:null,sku:'SECOND',size:null,color:null,cost_price:0,selling_price:1,low_stock_quantity:0,is_active:true,is_online:false}}];
   const result=await db.query('select tenh_edit_product_rows($1,$2,$3,$4) result',[B,L,P2,JSON.stringify(payload)]);assert.equal(result.rows[0].result.success,true);
   assert.equal((await db.query(`select barcode from branch_products where id='${P2}'`)).rows[0].barcode,value);
  }
  await db.exec(`alter table branch_product_details disable trigger all;update branch_product_details set barcode=' padded ' where id='${P2}';alter table branch_product_details enable trigger all;`);
  await db.exec(`begin;select tenh_barcode_writer_lock('${B}');update products set name='Renamed' where id='${P2}';update branch_product_details set sku='~tenh-edit-${P2}',barcode=null where id='${P2}';update branch_product_details set sku='SECOND',barcode=' padded ' where id='${P2}';commit;`);
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
test('v2 readiness detects source, ACL, binding and invariant drift',async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  const ready=async()=> (await db.query('select tenh_barcode_contract_v2_ready() ready')).rows[0].ready;
  for(const mutation of [
   "grant execute on function tenh_scan_order_ids(uuid,text) to anon",
   "alter table orders drop constraint orders_order_code_format",
   "alter table orders alter column order_code drop not null",
   "alter table orders drop constraint orders_order_code_key",
   "alter table products disable trigger tenh_preserve_barcode",
   "create or replace function tenh_scan_order_ids(p_business uuid,p_value text) returns table(order_id uuid) language sql stable security definer set search_path='' as $$select id from public.orders$$",
   "drop trigger tenh_preserve_barcode on products;create trigger tenh_preserve_barcode before insert or update of barcode on products for each row execute function tenh_preserve_branch_barcode()"
  ]){await db.exec('begin');await db.exec(mutation);assert.equal(await ready(),false,mutation);await db.exec('rollback');assert.equal(await ready(),true);}
  await db.exec("set role authenticated");await assert.rejects(db.query('select * from tenh_barcode_contract_v2'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
test('v2 imports and batch edits enter through the same coordinator before other locks',async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  const definition=async signature=>(await db.query('select pg_get_functiondef($1::regprocedure) source',[signature])).rows[0].source;
  const batch=await definition('tenh_edit_product_rows(uuid,uuid,uuid,jsonb)'),imp=await definition('tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text)');
  assert.ok(batch.indexOf('tenh_barcode_writer_lock')<batch.indexOf("'tenh_edit_product_rows:'"));
  assert.ok(imp.indexOf('tenh_barcode_writer_lock')<imp.indexOf('hashtextextended(p_business_id::text,9616)'));
  assert.ok(imp.indexOf('tenh_barcode_writer_lock')<imp.indexOf('lock table'));
  const preview=await db.query("select tenh_import_business_safe($1,'products','update',$2,$3,false) result",[B,JSON.stringify([{name:'Import fixture',sku:'SECOND',selling_price:9,cost_price:0,low_stock_quantity:0,is_active:true}]),L]);
  assert.equal(preview.rows[0].result.updated,1);
  assert.equal(Number((await db.query("select selling_price from branch_products where id=$1",[P2])).rows[0].selling_price),1);
  await assert.rejects(db.query("update branch_product_details set barcode='000011' where id=$1",[P]),/reviewed identifier writer/);
  await db.exec('begin');await db.query('select tenh_barcode_writer_lock($1)',[B]);await db.query("update branch_product_details set barcode='000011' where id=$1",[P]);await db.exec('commit');
  await db.exec("select set_config('test.allowed','false',false)");await assert.rejects(db.query('select tenh_barcode_writer_lock($1)',[B]),/denied/);
 }finally{await db.close();}
});
// PGlite is one session. These tests do not execute concurrent PostgreSQL transactions.

