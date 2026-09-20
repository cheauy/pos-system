// Ephemeral PostgreSQL/WASM test. Uses simplified legacy helpers deliberately;
// tests new transaction orchestration, not the full deployed POS/stock/loyalty engine.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const b=id(1),branch=id(2),other=id(3),user=id(4),product=id(5),category=id(6),request=id(7);
(async()=>{
 const db=new PGlite();let count=0;
 const check=async(name,fn)=>{await fn();count++;console.log(`PASS ${name}`);};
 try{
  await db.exec(`
  create role anon;create role authenticated;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select '${user}'::uuid$$;
  create type order_status as enum('new','pending','completed','cancelled','refunded');
  create type online_status as enum('new','accepted','preparing','ready','completed','rejected');
  create table businesses(id uuid primary key);
  create table business_members(business_id uuid,user_id uuid,role text,is_active boolean);
  create table categories(id uuid primary key,business_id uuid,branch_ids uuid[]);
  create table products(id uuid primary key,business_id uuid,is_active boolean,category_id uuid,stock_quantity integer);
  create table product_location_stock(business_id uuid,product_id uuid,location_id uuid,quantity integer);
  create table cash_register_shifts(id uuid primary key default gen_random_uuid(),business_id uuid,location_id uuid,status text default 'open',opening_cash numeric default 0,closing_cash numeric,expected_cash numeric,variance numeric);
  create table orders(id uuid primary key default gen_random_uuid(),business_id uuid,order_number text default 'TEST-ORDER',order_source text default 'pos',location_id uuid,register_shift_id uuid,status order_status,online_status online_status,payment_method text,payment_status text,total numeric,amount_paid numeric,change_amount numeric,pos_checkout jsonb,updated_at timestamptz);
  create table cash_movements(id uuid primary key default gen_random_uuid(),business_id uuid,shift_id uuid,location_id uuid,created_by uuid,movement_type text,amount numeric,reason text,reference text);
  create table returns(id uuid primary key default gen_random_uuid(),business_id uuid,order_id uuid,return_number text,refund_amount numeric,refund_method text,status text);
  create table requests(id uuid primary key,business_id uuid,hash text,receipt jsonb);
  create function tenh_request_branch(p_business uuid)returns uuid language sql stable as $$select nullif(current_setting('test.branch',true),'')::uuid$$;
  create function tenh_assert_plan_branch(p_business uuid,p_branch uuid)returns void language plpgsql set search_path=public as $$begin perform id from businesses where id=p_business for update;if p_branch not in ('${branch}','${other}')then raise exception 'Invalid branch';end if;end$$;
  create function tenh_pos_checkout_status(p_business_id uuid,p_request_id uuid)returns jsonb language sql set search_path=public as $$select receipt from requests where id=p_request_id and business_id=p_business_id$$;
  create function tenh_pos_checkout(p_business_id uuid,p_input jsonb)returns jsonb language plpgsql set search_path=public as $$declare old requests%rowtype;r jsonb;o uuid;begin
   select * into old from requests where id=(p_input->>'requestId')::uuid and business_id=p_business_id;
   if found then if old.hash<>md5(p_input::text)then raise exception 'Request already used with different data';end if;return old.receipt;end if;
   insert into orders(business_id,location_id,status,payment_method,payment_status,total,amount_paid,change_amount,pos_checkout)
    values(p_business_id,(p_input->>'branchId')::uuid,'new','cod','paid',15,20,5,'{"cashReceived":15,"receipt":{"amountPaid":20,"change":5}}')returning id into o;
   update products set stock_quantity=stock_quantity-1 where id='${product}';
   r:=jsonb_build_object('orderId',o);insert into requests values((p_input->>'requestId')::uuid,p_business_id,md5(p_input::text),r);return r;
  end$$;
  create function close_cash_register_shift(b uuid,s uuid,c numeric,n text)returns jsonb language plpgsql set search_path=public as $$begin update cash_register_shifts set status='closed',closing_cash=c where business_id=b and id=s;return '{}'::jsonb;end$$;
  create function create_order_return(p_order_id uuid,p_reason text,p_items jsonb)returns uuid language plpgsql set search_path=public as $$begin return gen_random_uuid();end$$;
  create function tenh_run_branch_stock(p_business uuid,p_operation text,p_payload jsonb)returns jsonb language plpgsql set search_path=public as $$begin
   if p_operation<>'reject_online'then raise exception 'Unexpected stock operation';end if;
   update products set stock_quantity=stock_quantity+1 where id='${product}' and business_id=p_business;
   update orders set status='cancelled' where id=(p_payload->>'p_order_id')::uuid and business_id=p_business;
   return '{}'::jsonb;
  end$$;
  -- Fault injection AFTER cancellation to prove the outer transaction rolls back.
  create function test_status_failure()returns trigger language plpgsql as $$begin
   if new.online_status='rejected' and current_setting('test.fail_status',true)='yes'then raise exception 'Injected status write failure';end if;return new;
  end$$;
  create trigger test_status_failure before update of online_status on orders for each row execute function test_status_failure();
  insert into businesses values('${b}');insert into business_members values('${b}','${user}','owner',true);
  insert into categories values('${category}','${b}',null);
  insert into products values('${product}','${b}',true,'${category}',10);
  insert into product_location_stock values('${b}','${product}','${branch}',10);
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20260921090000_register_pos_accounting.sql','utf8'));
  const migration=fs.readFileSync('supabase/migrations/20260921110000_operating_branch_completion.sql','utf8');
  await check('migration compiles against enum order fields and can be reapplied',async()=>{await db.exec(migration);await db.exec(migration);});
  await db.exec('grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;set role authenticated;');
  const context=async v=>db.query("select set_config('test.branch',$1,false)",[v]);await context(branch);
  const drawer=(await db.query('insert into cash_register_shifts(business_id,location_id,opening_cash)values($1,$2,100)returning id',[b,branch])).rows[0].id;
  const input={requestId:request,branchId:branch,items:[{productId:product,quantity:1,optionIds:[]}]};let sale;
  await check('registered checkout links the selected branch drawer',async()=>{sale=(await db.query('select tenh_pos_checkout_registered($1,$2) r',[b,input])).rows[0].r;assert.equal((await db.query('select register_shift_id from orders where id=$1',[sale.orderId])).rows[0].register_shift_id,drawer);});
  await check('direct stale-branch call fails before core checkout',async()=>{await context(other);await assert.rejects(db.query('select tenh_pos_checkout_registered($1,$2)',[b,{...input,requestId:id(8)}]),/operating branch/);await context(branch);assert.equal((await db.query('select count(*) n from requests')).rows[0].n,1);});
  await check('category restricted to a different branch blocks checkout without stock movement',async()=>{await db.query('update categories set branch_ids=$1 where id=$2',[[other],category]);await assert.rejects(db.query('select tenh_pos_checkout_registered($1,$2)',[b,{...input,requestId:id(9)}]),/category/);assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,9);await db.query('update categories set branch_ids=null where id=$1',[category]);});
  const parts=async(meta,method,paid,change)=>(await db.query('select * from tenh_register_payment_parts($1,$2,$3,$4)',[meta,method,paid,change])).rows[0];
  await check('drawer split uses saved receipt change rather than mutable order change',async()=>{const p=await parts({receipt:{amountPaid:20,change:5},tenders:[{method:'cash',amount:10},{method:'bank_transfer',amount:10}]},'other',999,0);assert.equal(Number(p.cash),5);assert.equal(Number(p.noncash),10);});
  await check('legacy empty metadata and explicit zero cash agree with the UI helper',async()=>{assert.equal(Number((await parts({},'cod',20,5)).cash),15);assert.equal(Number((await parts({cashReceived:0},'other',15,0)).noncash),15);});
  await check('NaN/Infinity/count precision fail before closing a drawer',async()=>{for(const bad of ['NaN','Infinity','-1','0.001'])await assert.rejects(db.query('select tenh_close_register_accounted($1,$2,$3,null)',[b,drawer,bad]),/finite counted/);assert.equal((await db.query('select status from cash_register_shifts where id=$1',[drawer])).rows[0].status,'open');});
  await check('inconsistent payment totals roll the entire close back',async()=>{await db.query('update orders set pos_checkout=$1 where id=$2',[{cashReceived:100,receipt:{amountPaid:20,change:5}},sale.orderId]);await assert.rejects(db.query('select tenh_close_register_accounted($1,$2,115,null)',[b,drawer]),/drawer cash/);assert.equal((await db.query('select status from cash_register_shifts where id=$1',[drawer])).rows[0].status,'open');await db.query('update orders set pos_checkout=$1 where id=$2',[{cashReceived:15,receipt:{amountPaid:20,change:5}},sale.orderId]);});
  await check('cash movements and original payment produce saved closing summary',async()=>{await db.query("insert into cash_movements(business_id,shift_id,location_id,movement_type,amount)values($1,$2,$3,'cash_in',10),($1,$2,$3,'cash_out',2)",[b,drawer,branch]);const r=(await db.query('select tenh_close_register_accounted($1,$2,123,null) r',[b,drawer])).rows[0].r;assert.equal(r.expected,123);assert.equal(r.variance,0);});
  await check('committed retry after close returns same order and never decrements twice',async()=>{const before=(await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity;const r=(await db.query('select tenh_pos_checkout_registered($1,$2) r',[b,input])).rows[0].r;assert.deepEqual(r,sale);assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,before);});
  const online=async(overrides={})=>(await db.query("insert into orders(business_id,location_id,order_source,status,online_status,payment_method,payment_status,total,amount_paid,change_amount)values($1,$2,'online',$3,$4,'cod',$5,15,$6,0)returning id",[b,overrides.branch||branch,overrides.status||'new',overrides.online||'new',overrides.paid?'paid':'unpaid',overrides.paid?15:0])).rows[0].id;
  const o=await online();
  await check('rejection failure rolls cancellation and restock back together',async()=>{const before=(await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity;await db.query("select set_config('test.fail_status','yes',false)");await assert.rejects(db.query("select tenh_update_online_order_status($1,$2,'rejected','new')",[b,o]),/Injected/);const r=(await db.query('select status,online_status from orders where id=$1',[o])).rows[0];assert.equal(r.status,'new');assert.equal(r.online_status,'new');assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,before);await db.query("select set_config('test.fail_status','no',false)");});
  await check('rejection is idempotent and only restocks once',async()=>{const before=(await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity;const first=(await db.query("select tenh_update_online_order_status($1,$2,'rejected','new') r",[b,o])).rows[0].r;const second=(await db.query("select tenh_update_online_order_status($1,$2,'rejected','new') r",[b,o])).rows[0].r;assert.equal(first.alreadyApplied,false);assert.equal(second.alreadyApplied,true);assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,before+1);});
  await check('paid orders require refund workflow rather than rejection',async()=>{const paid=await online({paid:true});await assert.rejects(db.query("select tenh_update_online_order_status($1,$2,'rejected','new')",[b,paid]),/recorded payment/);assert.equal((await db.query('select status from orders where id=$1',[paid])).rows[0].status,'new');});
  await check('stale status cannot overwrite a newer forward transition',async()=>{const q=await online();await db.query("select tenh_update_online_order_status($1,$2,'accepted','new')",[b,q]);await assert.rejects(db.query("select tenh_update_online_order_status($1,$2,'preparing','new')",[b,q]),/order changed/i);await db.query("select tenh_update_online_order_status($1,$2,'completed','accepted')",[b,q]);await assert.rejects(db.query("select tenh_update_online_order_status($1,$2,'ready','completed')",[b,q]),/finalized/);});
  await check('foreign operating branch cannot change the order',async()=>{const q=await online({branch:other});await assert.rejects(db.query("select tenh_update_online_order_status($1,$2,'accepted','new')",[b,q]),/not found in this branch/);});
  console.log(`${count} PostgreSQL fixture checks passed; deployed schemas, auth/RLS policies and concurrency still need staging tests.`);
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
