const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
(async()=>{
 const db=new PGlite();
 const business='10000000-0000-0000-0000-000000000001',branch='20000000-0000-0000-0000-000000000001',user='30000000-0000-0000-0000-000000000001',product='40000000-0000-0000-0000-000000000001';
 try{
  await db.exec(`create schema auth;create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
   create table business_members(business_id uuid,user_id uuid,role text,is_active boolean);
   create table branch_notification_role_settings(business_id uuid,location_id uuid,notification_type text,target_roles text[],primary key(business_id,location_id,notification_type));
   create table business_notifications(id uuid default gen_random_uuid(),business_id uuid,notification_key text,notification_type text,severity text,title text,message text,href text,target_roles text[],source_table text,source_id uuid,occurred_at timestamptz,is_active boolean,metadata jsonb,updated_at timestamptz,unique(business_id,notification_key));
   create table orders(id uuid default gen_random_uuid(),business_id uuid,location_id uuid,order_number text,guest_name text,order_source text,online_status text,created_at timestamptz,payment_reference text,payment_status text,requested_for timestamptz);
   create table branch_product_details(id uuid,business_id uuid,location_id uuid,name text,is_active boolean,low_stock_quantity int,branch_archived boolean);
   create table product_location_stock(product_id uuid,business_id uuid,location_id uuid,quantity int,low_stock_threshold int);
   create table purchase_orders(id uuid default gen_random_uuid(),business_id uuid,location_id uuid,po_number text,status text,updated_at timestamptz);
   create table stock_transfers(id uuid default gen_random_uuid(),business_id uuid,destination_location_id uuid,transfer_number text,status text,sent_at timestamptz,updated_at timestamptz);
   create table cash_register_shifts(id uuid default gen_random_uuid(),business_id uuid,location_id uuid,status text,variance numeric,closed_at timestamptz,opened_at timestamptz);
   insert into business_members values('${business}','${user}','owner',true);
   insert into branch_product_details values('${product}','${business}','${branch}','Product',true,0,false);
   insert into product_location_stock values('${product}','${business}','${branch}',3,5);
   insert into orders(business_id,location_id,order_number,order_source,online_status,created_at,payment_status,requested_for)values('${business}','${branch}','WEB-TEST','online','new',now(),'pending_verification',now()+interval '1 hour');
   insert into purchase_orders(business_id,location_id,po_number,status,updated_at)values('${business}','${branch}','PO-TEST','sent',now());
   insert into stock_transfers(business_id,destination_location_id,transfer_number,status,updated_at)values('${business}','${branch}','ST-TEST','in_transit',now());
   insert into cash_register_shifts(business_id,location_id,status,variance,closed_at)values('${business}','${branch}','closed',1,now());
   insert into business_notifications(business_id,notification_key,notification_type,is_active) values('${business}','retired-credit','credit_overdue',true);
  `);
  await db.exec(readFileSync('tests/fixtures/notification-refresh-before.sql','utf8'));
  const migration=readFileSync('supabase/migrations/20260926006000_current_notification_settings.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  // No credit tables exist: refresh must not depend on the retired feature.
  await db.query('select refresh_business_notifications($1)',[business]);
  const active=(await db.query('select notification_type from business_notifications where is_active order by notification_type')).rows.map(r=>r.notification_type);
  assert.deepEqual(active,['khqr_pending','low_stock','new_order','purchase_order','register_variance','scheduled_order','stock_transfer']);
  await db.query("insert into branch_notification_role_settings values($1,$2,'low_stock',array[]::text[]),($1,$2,'new_order',array['manager'])",[business,branch]);
  await db.query('select refresh_business_notifications($1)',[business]);
  assert.deepEqual((await db.query("select target_roles from business_notifications where notification_type='low_stock'")).rows[0].target_roles,[]);
  assert.deepEqual((await db.query("select target_roles from business_notifications where notification_type='new_order'")).rows[0].target_roles,['manager']);
  assert.equal((await db.query('select count(*)::int n from business_notifications')).rows[0].n,8);
  await db.exec('update product_location_stock set quantity=20');
  await db.query('select refresh_business_notifications($1)',[business]);
  assert.equal((await db.query("select is_active from business_notifications where notification_type='low_stock'")).rows[0].is_active,false);
  console.log('PASS: seven live alerts, per-branch stock threshold, role changes, disable-all, stable IDs, resolved stock and retired credit.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
