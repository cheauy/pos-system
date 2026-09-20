const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { PGlite } = require('./helpers/pglite.cjs');
const definitions = {...JSON.parse(fs.readFileSync('tests/fixtures/branch-schema.json')).definitions,...JSON.parse(fs.readFileSync('tests/fixtures/operating-branch-schema.json')).definitions};
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const b=id(1), a=id(2), c=id(3), foreign=id(4), user=id(5), p=id(6), q=id(7), cat=id(8), otherBusiness=id(9);
(async()=>{
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select '${user}'::uuid$$;
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('test.auth_role',true),''),'authenticated')$$;`);
 for(const [table,def] of Object.entries(definitions)) {
   const columns=Object.entries(def.properties).map(([name,prop])=>`"${name}" ${prop.format || 'text'}${name==='id'?' primary key default gen_random_uuid()':''}`);
   await db.exec(`create table public."${table}"(${columns.join(',')});`);
 }
 await db.exec(`
 create table categories(id uuid primary key default gen_random_uuid(),business_id uuid,name text,is_online boolean);
 create table business_storefronts(business_id uuid primary key,social_links jsonb);
 create table order_items(id uuid primary key default gen_random_uuid(),business_id uuid,order_id uuid,product_id uuid);
 create table stock_transfer_items(id uuid primary key default gen_random_uuid(),business_id uuid,transfer_id uuid,product_id uuid,quantity integer);
 alter table product_location_stock add unique(location_id,product_id);
 create function tenh_assert_plan_branch(b uuid,l uuid) returns void language plpgsql as $$begin if not exists(select 1 from business_locations where id=l and business_id=b and is_active)then raise exception 'Inactive branch';end if;end$$;
 create table inventory_movements(id uuid primary key default gen_random_uuid(),business_id uuid,owner_id uuid,product_id uuid,movement_type text,quantity integer,stock_before integer,stock_after integer,note text);
 create function place_online_order(p_business_slug text,p_items jsonb,p_fulfillment_type text,p_guest_name text,p_guest_phone text,p_guest_address text,p_customer_note text,p_table_token uuid,p_payment_method text,p_payment_reference text,p_delivery_zone_id uuid,p_requested_for timestamptz,p_coupon_code text) returns jsonb language plpgsql as $$declare o uuid; item jsonb;begin
 insert into orders(business_id,order_source,location_id)values('${b}','online','${a}')returning id into o;
 for item in select value from jsonb_array_elements(p_items)loop update products set stock_quantity=stock_quantity-(item->>'quantity')::integer where id=(item->>'productId')::uuid;end loop;
 return jsonb_build_object('orderId',o);end$$;
 insert into businesses(id,slug,is_active)values('${b}','store',true),('${otherBusiness}','other',true);
 insert into business_locations(id,business_id,name,is_default,is_active)values('${a}','${b}','Main',true,true),('${c}','${b}','Second',false,true),('${foreign}','${otherBusiness}','Foreign',true,true);
 insert into business_members(id,business_id,user_id,role,is_active)values('${id(10)}','${b}','${user}','owner',true);
 insert into categories(id,business_id,name,is_online)values('${cat}','${b}','Clothes',true);
 insert into business_storefronts(business_id)values('${b}');
 insert into products(id,business_id,name,stock_quantity,is_active,is_online,category_id)values('${p}','${b}','Shirt',10,true,true,'${cat}'),('${q}','${b}','Other shirt',5,true,true,'${cat}');
 insert into product_location_stock(business_id,location_id,product_id,quantity)values('${b}','${a}','${p}',6),('${b}','${c}','${p}',4),('${b}','${a}','${q}',5);
 `);
 await db.exec(`create function create_order_return(p_order_id uuid,p_reason text,p_items jsonb) returns uuid language plpgsql as $$declare r uuid;begin
 insert into returns(business_id,order_id,refund_amount,status,return_number)values('${b}',p_order_id,0,'refunded','R-TEST')returning id into r;
 update returns set refund_amount=2 where id=r;
 update products set stock_quantity=stock_quantity+1 where id='${p}';
 return r;end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260921090000_register_pos_accounting.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260921100000_operating_branches.sql','utf8'));
 for(const table of ['orders','customers','suppliers','purchases','purchase_orders','returns','expenses','cash_register_shifts','cash_movements','order_items','return_items','purchase_items','purchase_order_items']) await db.exec(`create policy test_member_access on ${table} for all to authenticated using (true) with check (true);`);
 await db.exec('grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;');
 const context=async(branch,flow=false)=>db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-tenh-business-id':b,'x-tenh-branch-id':branch,...(flow?{'x-tenh-stock-flow':'branch-delta'}:{})})]);
 await context(a); await db.exec('set role authenticated');
 const ca=(await db.query('insert into customers(business_id,name)values($1,$2)returning id,location_id',[b,'Main customer'])).rows[0]; assert.equal(ca.location_id,a);
 await context(c);
 const cb=(await db.query('insert into customers(business_id,name)values($1,$2)returning id,location_id',[b,'Second customer'])).rows[0];assert.equal(cb.location_id,c);
 assert.deepEqual((await db.query('select id from customers')).rows.map(r=>r.id),[cb.id]);
 await assert.rejects(db.query('insert into customers(business_id,name,location_id)values($1,$2,$3)',[b,'Wrong',a]),/another branch/);
 await assert.rejects(db.query('update customers set location_id=$1 where id=$2',[a,cb.id]),/cannot be changed/);
 assert.equal((await db.query('update customers set name=$1 where id=$2 returning id',['Wrong',ca.id])).rows.length,0);
 await context(foreign);await assert.rejects(db.query('select * from customers'),/Invalid operating branch/);
 await context(c);
 const oc=(await db.query("insert into orders(business_id,order_source)values($1,'pos')returning id,location_id",[b])).rows[0];assert.equal(oc.location_id,c);
 await context(a); await assert.rejects(db.query('insert into returns(business_id,order_id)values($1,$2)',[b,oc.id]),/another branch/);
 await db.exec('reset role'); // Definer RPC writes must also be rejected.
 await assert.rejects(db.query('insert into order_items(business_id,order_id,product_id)values($1,$2,$3)',[b,oc.id,p]),/another branch/);
 await db.query('update categories set branch_ids=$1 where id=$2',[[c],cat]);
 await assert.rejects(db.query('update categories set branch_ids=$1 where id=$2',[[foreign],cat]),/active branches/);
 const transfer=(await db.query('insert into stock_transfers(business_id,source_location_id,destination_location_id,status)values($1,$2,$3,$4)returning id',[b,c,a,'draft'])).rows[0].id;
 await assert.rejects(db.query('insert into stock_transfer_items(business_id,transfer_id,product_id,quantity)values($1,$2,$3,1)',[b,transfer,q]),/source branch/);
 await db.query('insert into stock_transfer_items(business_id,transfer_id,product_id,quantity)values($1,$2,$3,1)',[b,transfer,p]);
 // Purchase/return deltas change only the active branch, atomically.
 await context(c);
 const purchase = async(qty,notes='') => (await db.query('select tenh_run_branch_stock($1,$2,$3) result',[b,'create_purchase',{p_items:[{product_id:p,quantity:qty,unit_cost:3}],p_notes:notes}])).rows[0].result;
 const firstPurchase=await purchase(3);
 assert.equal((await db.query('select count(*) n from purchase_items where purchase_id=$1',[firstPurchase])).rows[0].n,1);
 assert.equal(Number((await db.query('select total from purchases where id=$1',[firstPurchase])).rows[0].total),9);
 await assert.rejects(purchase(1.5),/integer|whole/);
 await assert.rejects(db.query('select tenh_run_branch_stock($1,$2,$3)',[b,'create_purchase',{p_items:[{product_id:p,quantity:1,unit_cost:'NaN'}]}]),/valid unit costs/);
 assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[p,c])).rows[0].quantity,7);
 assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[p,a])).rows[0].quantity,6);
 const alreadyScoped=await purchase(2);
 assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[p,c])).rows[0].quantity,9);
 await db.query('select tenh_run_branch_stock($1,$2,$3)',[b,'cancel_purchase',{p_purchase_id:alreadyScoped,p_reason:'Wrong quantity'}]);
 const badPurchase=(await db.query('insert into purchases(business_id,status)values($1,$2)returning id',[b,'received'])).rows[0].id;
 await db.query('insert into purchase_items(purchase_id,product_id,quantity)values($1,$2,8)',[badPurchase,p]);
 await assert.rejects(db.query('select tenh_run_branch_stock($1,$2,$3)',[b,'cancel_purchase',{p_purchase_id:badPurchase,p_reason:'Wrong quantity'}]),/Not enough stock in this branch/);
 assert.equal((await db.query('select stock_quantity from products where id=$1',[p])).rows[0].stock_quantity,13);
 await context(a);
 await assert.rejects(db.query('select tenh_run_branch_stock($1,$2,$3)',[b,'cancel_purchase',{p_purchase_id:badPurchase,p_reason:'Wrong quantity'}]),/Document not found/);
 // Public order uses the configured branch, never the original procedure's Main default.
 await db.query("select set_config('request.headers','{}',false),set_config('test.auth_role','service_role',false)");
 await db.query('update business_storefronts set fulfillment_location_id=$1 where business_id=$2',[c,b]);
 const checkout={p_items:[{productId:p,quantity:2}],p_fulfillment_type:'delivery',p_guest_name:'Customer',p_guest_phone:'123',p_payment_method:'cod'};
 const placed=(await db.query('select place_branch_online_order($1,$2) receipt',['store',checkout])).rows[0].receipt;
 assert.equal((await db.query('select location_id from orders where id=$1',[placed.orderId])).rows[0].location_id,c);
 assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[p,c])).rows[0].quantity,5);
 assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[p,a])).rows[0].quantity,6);
 await assert.rejects(db.query('select place_branch_online_order($1,$2)',['store',{...checkout,p_items:[{productId:q,quantity:1}]}]),/not assigned/);
 await db.query('update categories set branch_ids=$1 where id=$2',[[a],cat]);
 await assert.rejects(db.query('select place_branch_online_order($1,$2)',['store',checkout]),/Product not found/);
 // Holds and their deletion remain in their original branch.
 await context(c);await db.query("select set_config('test.auth_role','authenticated',false)");
 const hold=(await db.query('insert into tenh_pos_holds(business_id,draft)values($1,$2)returning id',[b,{branchId:c}])).rows[0].id;
 await context(a);await assert.rejects(db.query('delete from tenh_pos_holds where id=$1',[hold]),/another branch/);
 await assert.rejects(db.query('insert into tenh_pos_holds(business_id,draft)values($1,$2)',[b,{branchId:c}]),/another branch/);
 // Scoped notifications use the source order branch, including the sidebar RPC.
 await db.query('insert into business_notifications(business_id,source_table,source_id,is_active,title)values($1,$2,$3,true,$4)',[b,'orders',oc.id,'Second branch order']);
 await db.exec('create policy test_notification_member on business_notifications for select to authenticated using(true);set role authenticated;');
 assert.equal((await db.query('select * from tenh_branch_notifications($1,$2)',[b,a])).rows.length,0);
 assert.equal((await db.query('select * from tenh_branch_notifications($1,$2)',[b,c])).rows.length,1);
 await db.exec('reset role');await context(c);
 // Real register-accounting wrapper plus branch stock reconciliation.
 const shift=(await db.query("insert into cash_register_shifts(business_id,location_id,status,opened_by)values($1,$2,'open',$3)returning id",[b,c,user])).rows[0].id;
 await db.query('update orders set pos_checkout=$1 where id=$2',[{cashReceived:5,receipt:{amountPaid:5,change:0}},oc.id]);
 await db.query('insert into order_items(business_id,order_id,product_id)values($1,$2,$3)',[b,oc.id,p]);
 const stockBefore=(await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[p,c])).rows[0].quantity;
 await db.query('select tenh_run_branch_stock($1,$2,$3)',[b,'return_order',{p_order_id:oc.id,p_reason:'Return',p_items:[],p_refund_method:'cash'}]);
 assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[p,c])).rows[0].quantity,stockBefore+1);
 assert.equal(Number((await db.query('select amount from cash_movements where shift_id=$1',[shift])).rows[0].amount),2);
 await assert.rejects(db.query('update returns set refund_amount=0 where order_id=$1',[oc.id]),/cannot be edited/);
 await db.query("update cash_register_shifts set status='closed' where id=$1",[shift]);
 await assert.rejects(db.query('select tenh_run_branch_stock($1,$2,$3)',[b,'return_order',{p_order_id:oc.id,p_reason:'Return',p_items:[],p_refund_method:'cash'}]),/Open the original POS branch/);
 assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[p,c])).rows[0].quantity,stockBefore+1);
 console.log('Passed: branch defaults, RLS isolation, immutable ownership, foreign-branch rejection, definer child guards, category assignment, source transfer validation, atomic purchasing/return stock and online order attribution.');
 await db.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
