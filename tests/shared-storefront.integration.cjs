/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'service_role')$$;
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
  for(const table of JSON.parse(fs.readFileSync('tests/fixtures/shared-storefront-columns.json','utf8'))) {
   await db.exec('create table '+table.name+'('+table.columns+');');
   if (table.columns.split(',').some(c=>c==='id uuid')) await db.exec('alter table '+table.name+' alter column id set default gen_random_uuid();');
  }
  await db.exec(`create function tenh_assert_plan_branch(b uuid,l uuid) returns void language plpgsql as $$begin
   if not exists(select 1 from business_locations where id=l and business_id=b and is_active and not coalesce(plan_disable_pending,false)) then raise exception 'Inactive branch';end if;end$$;
   create function assign_order_branch() returns trigger language plpgsql as $$begin
    new.location_id:=current_setting('tenh.online_branch')::uuid;
    if not exists(select 1 from customers where id=new.customer_id and business_id=new.business_id and location_id=new.location_id) then raise exception 'Customer belongs to another branch.';end if;
    return new;end$$;
   create trigger branch_order before insert on orders for each row execute function assign_order_branch();
   insert into businesses(id,owner_id,slug,is_active)values('${id(1)}','${id(99)}','shop',true),('${id(2)}','${id(98)}','foreign',true);
   insert into business_locations(id,business_id,is_default,is_active,plan_disable_pending)values('${id(3)}','${id(1)}',true,true,false),('${id(4)}','${id(1)}',false,true,false),('${id(5)}','${id(2)}',true,true,false);
   insert into business_storefronts(business_id,is_published,accept_online_orders,accept_cod,accept_khqr,khqr_image_url,allow_pickup,allow_delivery,allow_dine_in,currency,fulfillment_location_id)values('${id(1)}',true,true,true,true,'qr.png',true,true,true,'USD','${id(3)}');
   insert into products(id,business_id,name,is_active,is_online,stock_quantity,selling_price)values('${id(10)}','${id(1)}','Main',true,true,5,10),('${id(11)}','${id(1)}','Second',true,true,7,12),('${id(12)}','${id(2)}','Foreign',true,true,20,20);
   insert into product_location_stock(business_id,location_id,product_id,quantity)values('${id(1)}','${id(3)}','${id(10)}',5),('${id(1)}','${id(4)}','${id(11)}',7),('${id(2)}','${id(5)}','${id(12)}',20);
   insert into customers(id,business_id,location_id,name,phone)values('${id(20)}','${id(1)}','${id(3)}','Existing Main customer','012345678');`);
  await db.exec(JSON.parse(fs.readFileSync('tests/fixtures/shared-storefront-checkout.json','utf8')).definition);
  await db.exec(fs.readFileSync('supabase/migrations/20260924007000_shared_online_store.sql','utf8'));
  const checkout={p_items:[{productId:id(11),quantity:2}],p_fulfillment_type:'pickup',p_guest_name:'Test Customer',p_guest_phone:'012345678',p_payment_method:'cod'};
  const place=async(payload=checkout)=>(await db.query('select place_branch_online_order($1,$2) result',['shop',payload])).rows[0].result;
  const snapshot=async()=>JSON.stringify((await db.query('select id,stock_quantity from products order by id')).rows)+(await db.query('select count(*) n from orders')).rows[0].n;
  const initial=await snapshot();
  for(const field of ['is_published','accept_online_orders']){
   await db.exec('update business_storefronts set '+field+'=false');
   for(const method of ['cod','khqr'])await assert.rejects(place({...checkout,p_payment_method:method}),/not published|not accepting/);
   assert.equal(await snapshot(),initial,'closed store cannot write stock or orders');
   await db.exec('update business_storefronts set '+field+'=true');
  }
  await assert.rejects(place({...checkout,p_items:[{productId:id(12),quantity:1}]}),/No branch/);
  await assert.rejects(place({...checkout,p_items:[{productId:id(11),quantity:1},{productId:id(10),quantity:1}]}),/No branch/);
  await assert.rejects(place({...checkout,p_items:[{productId:id(11),quantity:4},{productId:id(11),quantity:4}]}),/No branch/);
  await assert.rejects(place({...checkout,p_items:[{productId:id(11),quantity:1.5}]}),/Invalid product quantity/);
  await db.exec(`update business_locations set plan_disable_pending=true where id='${id(4)}'`);
  await assert.rejects(place(),/No branch/);
  await db.exec(`update business_locations set plan_disable_pending=false where id='${id(4)}'`);
  await db.exec(`insert into categories(id,business_id,is_online,branch_ids)values('${id(30)}','${id(1)}',true,array['${id(3)}'::uuid]);update products set category_id='${id(30)}' where id='${id(11)}'`);
  await assert.rejects(place(),/No branch/);
  await db.exec('update categories set branch_ids=null');
  const receipt=await place();
  assert.equal(receipt.total,24);
  const order=(await db.query('select location_id,customer_id from orders where id=$1',[receipt.orderId])).rows[0];
  assert.equal(order.location_id,id(4),'secondary branch supplies its own product');
  assert.notEqual(order.customer_id,id(20),'same phone at another branch is not reused');
  assert.equal((await db.query('select location_id from customers where id=$1',[order.customer_id])).rows[0].location_id,id(4));
  assert.equal((await db.query('select quantity from product_location_stock where product_id=$1',[id(11)])).rows[0].quantity,5);
  assert.equal((await db.query('select stock_quantity from products where id=$1',[id(11)])).rows[0].stock_quantity,5);
  assert.equal((await db.query('select quantity from product_location_stock where product_id=$1',[id(10)])).rows[0].quantity,5,'other branch unchanged');
  const second=await place({...checkout,p_payment_method:'khqr',p_payment_reference:'proof:test'});
  assert.equal(second.customerId,order.customer_id,'repeat order reuses same-branch customer');
  assert.equal(second.paymentStatus,'pending_verification');
  await db.exec(`insert into business_tables(id,business_id,public_token,is_active)values('${id(40)}','${id(1)}','${id(41)}',true)`);
  await assert.rejects(place({...checkout,p_fulfillment_type:'dine_in',p_table_token:id(41)}),/No branch/);
  await db.exec(`update business_storefronts set fulfillment_location_id='${id(4)}'`);
  assert.equal((await db.query('select tenh_choose_online_branch($1,$2) branch',[id(1),{...checkout,p_fulfillment_type:'dine_in',p_table_token:id(41)}])).rows[0].branch,id(4),'QR tables retain their existing branch');
  await db.exec(`insert into business_coupons(id,business_id,location_id,code,is_active,discount_type,discount_value,usage_count)values('${id(50)}','${id(1)}','${id(3)}','MAIN',true,'fixed',1,0)`);
  await assert.rejects(place({...checkout,p_coupon_code:'MAIN'}),/No branch/);
  await db.exec(`update business_coupons set location_id='${id(4)}'`);
  const discounted=await place({...checkout,p_items:[{productId:id(11),quantity:1}],p_coupon_code:'MAIN'});
  assert.equal(discounted.total,11);
  await db.exec("select set_config('test.role','authenticated',false)");
  await assert.rejects(place(),/Server access required/);
  await assert.rejects(db.query('select tenh_choose_online_branch($1,$2)',[id(1),checkout]),/Server access required/);
  console.log('PASS: actual checkout, closures for COD/KHQR, branch stock and customer attribution, rollback, category/plan/table/coupon isolation, duplicate quantities and server-only access.');
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
