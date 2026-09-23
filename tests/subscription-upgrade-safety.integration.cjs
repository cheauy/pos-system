// Disposable Postgres/WASM fixture only; never reads a live connection URL.
// Run: node tests/subscription-upgrade-safety.integration.cjs
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const schema=require('./fixtures/branch-schema.json');
const migration='supabase/migrations/20260921120000_subscription_upgrade_safety.sql';
let passed=0;
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
   create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('test.auth_role',true),''),'service_role') $$;`);
  for(const name of ['businesses','business_locations','subscription_orders','business_members','orders','products','product_location_stock','cash_register_shifts','stock_transfers','profiles','subscription_history','stock_adjustments','expenses']){
   const fields=Object.entries(schema.definitions[name].properties).map(([key,p])=>{
    let type=p.format||'jsonb',def='';if(type==='double precision')type='numeric';
    if(key==='id')def=' default gen_random_uuid() primary key';
    else if(key==='created_at'||key==='updated_at')def=' default now()';
    else if(p.default==='CURRENT_DATE')def=' default CURRENT_DATE';
    else if(p.default!==undefined)def=' default '+(typeof p.default==='string'?"'"+p.default.replaceAll("'","''")+"'":String(p.default));
    return '"'+key+'" '+type+def;
   });
   await db.exec('create table public.'+name+'('+fields.join(',')+');');
  }
  // Only legacy functions referenced while installing the supplied migration are
  // stubbed. New v4 create/submit/review are the actual delivered SQL functions.
  await db.exec(`create function create_subscription_order(p_business_id uuid,p_requesting_user_id uuid,p_plan_key text,p_term_months integer,p_requested_user_limit integer)
   returns table(order_id uuid,order_status text) language sql as $$ select gen_random_uuid(),'pending_payment'::text $$;
   create function review_subscription_order(p_order_id uuid,p_decision text,p_admin_user_id uuid,p_admin_email text,p_review_note text)
   returns table(new_expiry timestamptz) language sql as $$ select now() $$;
   create unique index stock_location_product on product_location_stock(location_id,product_id);
   create function adjust_product_stock(p_product_id uuid,p_mode text,p_quantity integer,p_reason text,p_reference text) returns void language plpgsql as $$ begin return; end $$;
   create function place_online_order(p_business_slug text,p_items jsonb,p_fulfillment_type text,p_guest_name text,p_guest_phone text,p_guest_address text,p_customer_note text,p_table_token uuid,p_payment_method text,p_payment_reference text,p_delivery_zone_id uuid,p_requested_for timestamptz,p_coupon_code text)
   returns jsonb language sql as $$ select '{}'::jsonb $$;
   create function tenh_branch_scope_ready() returns boolean language sql as $$ select true $$;`);
  await db.exec(fs.readFileSync('supabase/migrations/20260920_subscription_branch_limits.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20260920150000_custom_plan_direct_pricing.sql','utf8'));
  const b='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
  await db.query("insert into businesses(id,name,slug,owner_id,is_active,subscription_status,subscription_plan_key,subscription_user_limit) values($1,'Fixture','fixture',$2,true,'trialing','trial',1)",[b,owner]);
  await db.query("insert into business_members(business_id,user_id,role,is_active) values($1,$2,'owner',true)",[b,owner]);
  await db.query("insert into profiles(id,role,is_active) values($1,'super_admin',true)",[admin]);
  await db.query("insert into business_locations(business_id,name,code,is_default,is_active) values($1,'Main','MAIN',true,true)",[b]);
  // Representative legacy restriction, not a claimed dump of the live constraint.
  await db.exec(`alter table subscription_orders add constraint subscription_orders_user_limit_check
   check((plan_key='custom' and requested_user_limit between 11 and 500) or
         (plan_key<>'custom' and requested_user_limit in (1,5,10)));`);
  async function check(name,fn){await fn();console.log('PASS '+name);passed++;}
  async function rollback(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
  async function quote(plan='custom',users=1,branches=2,months=1){
   const r=await db.query('select * from create_branch_subscription_order($1,$2,$3,$4,$5,$6,$7)',[b,owner,plan,months,users,plan==='custom'?null:plan,branches]);return r.rows[0].order_id;
  }
  async function readOrder(id){return(await db.query('select * from subscription_orders where id=$1',[id])).rows[0];}
  async function pay(id,action,body){return db.query('select tenh_subscription_payment($1,$2,$3,$4,$5::jsonb)',[b,owner,id,action,JSON.stringify(body)]);}
  const proof=id=>({note:'Manual proof verified in fixture',bucket:'tenh-pos-subscription-payment-proofs',path:`${b}/${id}/test.png`,name:'test.png',mime:'image/png',size:100});
  async function submit(id){await pay(id,'method',{method:'manual'});await pay(id,'submit',proof(id));}
  async function review(id,decision='approve',actor=admin,note=null){return(await db.query('select review_branch_subscription_order($1,$2,$3,$4,$5) result',[id,decision,actor,'admin@example.invalid',note])).rows[0].result;}
  await check('legacy check rejects a one-user Custom plan',async()=>assert.rejects(quote(),/subscription_orders_user_limit_check/));
  await db.exec(fs.readFileSync(migration,'utf8'));
  await check('migration reruns without renaming its wrapper into itself',async()=>db.exec(fs.readFileSync(migration,'utf8')));
  await check('replacement constraint remains validated',async()=>{const r=await db.query("select convalidated from pg_constraint where conrelid='subscription_orders'::regclass and conname='subscription_orders_user_limit_check'");assert.equal(r.rows[0].convalidated,true);});
  let id=await quote();
  await check('one user, two branches = $45, version4, no old base plan',async()=>{const o=await readOrder(id);assert.equal(o.pricing_version,4);assert.equal(o.base_plan_key,null);assert.equal(Number(o.total_amount),45);assert.ok(o.source_subscription_snapshot);});
  await check('quote does not activate subscription',async()=>assert.equal((await db.query('select subscription_status from businesses where id=$1',[b])).rows[0].subscription_status,'trialing'));
  await check('repeat identical quote reuses the same order',async()=>assert.equal(await quote(),id));
  await check('proof without a valid selected method fails',async()=>assert.rejects(pay(id,'submit',proof(id)),/Choose a payment method/));
  await check('pending quote cannot be approved without proof submission',async()=>assert.rejects(review(id),/submitted payment/));
  await pay(id,'method',{method:'manual'});
  await check('another business proof path is rejected',async()=>assert.rejects(pay(id,'submit',{...proof(id),path:`${owner}/${id}/test.png`}),/valid payment proof/));
  await submit(id);
  await check('repeated proof submission is idempotent',async()=>{const before=await readOrder(id);await pay(id,'submit',proof(id));const after=await readOrder(id);assert.equal(String(before.payment_submitted_at),String(after.payment_submitted_at));});
  await check('quote blocked while payment is under review',async()=>assert.rejects(quote('custom',2,2),/under review/));
  await check('non-admin cannot approve',async()=>assert.rejects(review(id,'approve',owner),/Super Admin/));
  await check('approval activates paid capacities and keeps Custom basePlan null',async()=>{await review(id);const r=(await db.query('select * from businesses where id=$1',[b])).rows[0];assert.equal(r.subscription_status,'active');assert.equal(r.subscription_branch_limit,2);assert.equal(r.subscription_user_limit,1);assert.equal(r.subscription_base_plan_key,null);assert.equal(Number(r.subscription_cycle_value),45);});
  await check('second approval cannot extend a paid cycle again',async()=>{const before=(await db.query('select subscription_expires_at from businesses where id=$1',[b])).rows[0];const result=await review(id);assert.equal(result.alreadyReviewed,true);const after=(await db.query('select subscription_expires_at from businesses where id=$1',[b])).rows[0];assert.equal(String(before.subscription_expires_at),String(after.subscription_expires_at));assert.equal((await db.query('select count(*)::int n from subscription_history')).rows[0].n,1);});
  await check('paid capacities cannot be reduced',async()=>assert.rejects(quote('custom',1,1),/reduce/));
  await check('out of range users rejected',async()=>assert.rejects(quote('custom',501,2),/valid users/));
  await check('out of range branches rejected',async()=>assert.rejects(quote('custom',1,101),/valid users/));
  await check('invalid billing term rejected',async()=>assert.rejects(quote('custom',1,2,2),/valid users/));
  await check('active business cannot downgrade plan tier',async()=>assert.rejects(quote('solo',1,1),/reduce|downgrade/));
  await check('expired quote cannot accept proof',async()=>{
   const q=await quote('custom',2,2,3);await pay(q,'method',{method:'manual'});
   await db.query("update subscription_orders set pricing_locked_until=now()-interval '1 hour' where id=$1",[q]);
   await assert.rejects(pay(q,'submit',proof(q)),/expired/);
  });
  await check('changed cycle invalidates an already quoted subscription',async()=>rollback(async()=>{
   const q=await quote('custom',2,2,3);await db.query('update businesses set subscription_cycle_value=46 where id=$1',[b]);
   await assert.rejects(pay(q,'method',{method:'manual'}),/Subscription changed/);
  }));
  await check('approval rejects manipulated totals and leaves entitlements unchanged',async()=>{
   const q=await quote('custom',2,2,3);await submit(q);const before=(await db.query('select subscription_user_limit from businesses where id=$1',[b])).rows[0];
   await db.query('update subscription_orders set total_amount=total_amount-1 where id=$1',[q]);
   await assert.rejects(review(q),/pricing/);assert.equal((await db.query('select subscription_user_limit from businesses where id=$1',[b])).rows[0].subscription_user_limit,before.subscription_user_limit);
   await review(q,'reject',admin,'Incorrect proof; resolve amount first');
  });
  await check('rejection needs a reason and is retry-safe',async()=>{
   const q=await quote('custom',2,2,3);await submit(q);await assert.rejects(review(q,'reject',admin,''),/reason/);
   await review(q,'reject',admin,'Proof rejected');assert.equal((await review(q,'reject',admin,'Proof rejected')).alreadyReviewed,true);
  });
  // A fresh business verifies every standard plan and all four terms without
  // changing the current real application database or mocking v4 functions.
  await check('standard plans quote exact seat limits and configured term prices',async()=>rollback(async()=>{
   await db.query("update businesses set subscription_status='expired',subscription_expires_at=now()-interval '1 day' where id=$1",[b]);
   for(const [plan,users,monthly]of [['solo',1,10],['small_team',5,18],['growth',10,38]])for(const [months,pct]of [[1,0],[3,5],[6,8],[12,10]]){
    const q=await quote(plan,users,1,months),o=await readOrder(q);assert.equal(Number(o.total_amount),Math.round(monthly*months*(1-pct/100)*100)/100);assert.equal(o.order_kind,'reactivation');
   }
  }));
  await check('unused paid-cycle credit recalculates and is checked during approval',async()=>rollback(async()=>{
   await db.query("update businesses set subscription_plan_key='small_team',subscription_base_plan_key='small_team',subscription_user_limit=5,subscription_branch_limit=1,subscription_months=1,subscription_monthly_price=18,subscription_cycle_value=18,subscription_started_at=now()-interval '15 days',subscription_expires_at=now()+interval '15 days',subscription_status='active' where id=$1",[b]);
   const q=await quote('custom',6,2,3),o=await readOrder(q);assert.equal(Number(o.monthly_price),70);assert.equal(Number(o.term_price_amount),199.5);assert.equal(Number(o.remaining_credit_amount),9);assert.equal(Number(o.total_amount),190.5);
   await submit(q);await review(q);assert.equal((await db.query('select subscription_user_limit from businesses where id=$1',[b])).rows[0].subscription_user_limit,6);
  }));
  await check('legacy snapshot JSON is stable across SQL timezones',async()=>{
   const a=(await db.query('select tenh_subscription_snapshot(b) s from businesses b where id=$1',[b])).rows[0].s;
   await db.exec("set timezone='Asia/Phnom_Penh'");const c=(await db.query('select tenh_subscription_snapshot(b) s from businesses b where id=$1',[b])).rows[0].s;assert.deepEqual(a,c);
  });
  await check('non-service callers cannot invoke billing mutation',async()=>{
   await db.exec("set test.auth_role='authenticated'");await assert.rejects(quote(),/Server access/);await db.exec("set test.auth_role='service_role'");
  });
  console.log(JSON.stringify({suite:'subscription-upgrade-safety',passed,failed:0,engine:'PGlite Postgres fixture',liveSupabase:false,multiConnectionConcurrency:false}));
 } finally {await db.close();}
})().catch(error=>{console.error(error.message,error.where||'',error.position||'');console.error(JSON.stringify({passed,failed:1}));process.exitCode=1;});
