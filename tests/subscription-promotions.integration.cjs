// Isolated PostgreSQL/WASM tests: no live credentials, payments or customers.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const tables=require('./fixtures/branch-catalog-tables.json');
const functions=require('./fixtures/subscription-discounts-before.json');
const constraints=require('./fixtures/subscription-discount-constraints.json');
const migration=fs.readFileSync('supabase/migrations/20260924023000_subscription_promotions.sql','utf8');
const b='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
(async()=>{
 const db=new PGlite();let count=0;
 try{
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
   create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('test.auth_role',true),''),'service_role')$$;`);
  for(const name of ['businesses','business_members','business_locations','subscription_orders','profiles','cash_register_shifts','subscription_history','audit_logs']){
   const columns=tables.find(t=>t.name===name).columns.replace(/\bid uuid\b/,'id uuid default gen_random_uuid() primary key').replaceAll('created_at timestamp with time zone','created_at timestamp with time zone default now()').replaceAll('updated_at timestamp with time zone','updated_at timestamp with time zone default now()');
   await db.exec(`create table ${name}(${columns});`);
  }
  for(const f of functions.filter(f=>f.proname!=='tenh_subscription_snapshot'))await db.exec(f.definition);
  for(const constraint of constraints){
   if(constraint.definition.startsWith('CHECK'))await db.exec(`alter table subscription_orders add constraint ${constraint.name} ${constraint.definition}`);
   else await db.exec(constraint.definition);
  }
  await db.exec(`create trigger tenh_apply_branch_plan before update of status on subscription_orders for each row execute function tenh_apply_approved_branch_plan();
    create constraint trigger tenh_preserve_trial_time_after_paid_approval after update on subscription_orders deferrable initially deferred for each row execute function tenh_preserve_trial_time_after_paid_approval();`);
  await db.query("insert into businesses(id,name,is_active,subscription_status,subscription_plan_key,subscription_user_limit,subscription_branch_limit) values($1,'Test',true,'trialing','trial',1,1)",[b]);
  await db.query("insert into business_members(business_id,user_id,role,is_active) values($1,$2,'owner',true)",[b,owner]);
  await db.query("insert into business_locations(business_id,name,is_default,is_active,plan_disable_pending) values($1,'Main',true,true,false)",[b]);
  await db.query("insert into profiles(id,role,is_active) values($1,'super_admin',true)",[admin]);
  const row=async id=>(await db.query('select * from subscription_orders where id=$1',[id])).rows[0];
  async function quote(plan='solo',months=3,users=1,branches=1){
   const id=(await db.query('select * from create_safe_subscription_order($1,$2,$3,$4,$5,$6)',[b,owner,plan,months,users,branches])).rows[0].order_id;
   await db.query("update subscription_orders set payment_expires_at=now()+interval '10 minutes' where id=$1",[id]);
   return id;
  }
  async function offer({plan=null,months=null,percent=10,newCustomer=true,existing=true,start=-1,end=1}={}){
   await db.query("insert into subscription_promotions(name,plan_key,term_months,discount_percent,starts_on,ends_on,apply_new,apply_existing,updated_by) values('Test',$1,$2,$3,(now() at time zone 'Asia/Phnom_Penh')::date+$4::int,(now() at time zone 'Asia/Phnom_Penh')::date+$5::int,$6,$7,$8)",[plan,months,percent,start,end,newCustomer,existing,admin]);
  }
  async function submit(id){await db.query("update subscription_orders set status='payment_submitted',payment_note='Proof checked',proof_bucket='proof',proof_path='test.png' where id=$1",[id]);}
  async function approve(id){return(await db.query("select review_safe_subscription_order($1,'approve',$2,'admin@test.invalid',null) result",[id,admin])).rows[0].result;}
  async function active(){await db.exec("update businesses set subscription_status='active',subscription_plan_key='solo',subscription_monthly_price=10,subscription_months=3,subscription_discount_percent=5,subscription_cycle_value=28.50,subscription_started_at=now()-interval '1 month',subscription_expires_at=now()+interval '30 days'");}
  async function check(name,fn){await db.exec('begin');try{await fn();count++;console.log('PASS '+name);}finally{await db.exec('rollback');}}
  const legacy=await quote();
  await db.exec(migration);
  await db.exec(migration);
  const capacityMigration=fs.readFileSync('supabase/migrations/20260925001000_subscription_v7_deferred_capacity.sql','utf8');
  await db.exec(capacityMigration);await db.exec(capacityMigration);
  const durationMigration=fs.readFileSync('supabase/migrations/20260925002000_renewal_checkout_duration.sql','utf8');
  await db.exec(durationMigration);await db.exec(durationMigration);
  await check('legacy checkout is unchanged and approves after promotions start',async()=>{await offer({percent:30});assert.equal(Number((await row(legacy)).total_amount),28.5);await submit(legacy);assert.equal((await approve(legacy)).status,'approved');});
  await check('all plans and terms use server-side percentage math',async()=>{
   await offer({percent:10});
   for(const [plan,users,branches,monthly] of [['solo',1,1,10],['small_team',5,1,18],['growth',10,1,38],['custom',2,2,32]])for(const months of [1,3,6,12]){
    const order=await row(await quote(plan,months,users,branches));assert.equal(Number(order.discount_percent),10);assert.equal(Number(order.total_amount),Number((monthly*months*.9).toFixed(2)));
   }
  });
  await check('best offer wins without stacking and exact plan/term scope is respected',async()=>{
   await offer({percent:10});await offer({plan:'solo',months:3,percent:30});await offer({plan:'solo',months:3,percent:20});
   assert.equal(Number((await row(await quote())).total_amount),21);
   assert.equal(Number((await row(await quote('small_team',3,5))).discount_percent),10);
   assert.equal(Number((await row(await quote('solo',1))).discount_percent),10);
  });
  await check('scheduled/ended/disabled offers are excluded and ordinary discounts remain',async()=>{
   await offer({percent:30,start:1,end:2});await offer({percent:30,start:-2,end:-1});
   assert.equal(Number((await row(await quote())).discount_percent),5);
   await offer({percent:30});await db.exec('update subscription_promotions set enabled=false');
   assert.equal(Number((await row(await quote())).discount_percent),5);
  });
  await check('both inclusive date boundaries and customer eligibility work',async()=>{
   await offer({percent:30,start:0,end:0,newCustomer:false});
   assert.equal(Number((await row(await quote())).discount_percent),5);
   await db.exec("update businesses set subscription_status='expired'");
   assert.equal(Number((await row(await quote())).discount_percent),30);
  });
  await check('activation approves frozen quote after offer changes and activates correct term',async()=>{
   await offer({percent:30});const id=await quote();await db.exec('update subscription_promotions set discount_percent=10,enabled=false');
   await submit(id);assert.equal((await approve(id)).status,'approved');
   const business=(await db.query('select * from businesses')).rows[0];assert.equal(Number(business.subscription_cycle_value),21);assert.equal(Number(business.subscription_discount_percent),30);
   assert.equal((await approve(id)).alreadyReviewed,true);
  });
  await check('existing upgrade keeps proration and expiry while discounting added duration',async()=>{
   await active();await offer({percent:30,newCustomer:false});const id=await quote('small_team',3,5);let order=await row(id);
   assert.equal(order.order_kind,'upgrade');assert.equal(Number(order.term_price_amount),37.8);assert.ok(Number(order.upgrade_prorated_amount)>7.99);assert.equal(Number(order.total_amount),Number((37.8+Number(order.upgrade_prorated_amount)).toFixed(2)));
   await db.query('select * from update_pending_subscription_billing_term($1,$2,$3,0)',[b,owner,id]);order=await row(id);assert.equal(Number(order.discount_percent),0);assert.equal(Number(order.total_amount),Number(order.upgrade_prorated_amount));
   await db.query('select * from update_pending_subscription_billing_term($1,$2,$3,3)',[b,owner,id]);assert.equal(Number((await row(id)).discount_percent),30);
   await submit(id);await approve(id);const business=(await db.query('select * from businesses')).rows[0];assert.equal(business.subscription_user_limit,5);assert.ok(new Date(business.subscription_expires_at)>new Date(order.current_subscription_expires_at));
  });
  await check('reactivation updates term discount and locks when payment starts',async()=>{
   await db.exec("update businesses set subscription_status='expired'");await offer({plan:'solo',months:3,percent:30});const id=await quote();
   await db.query('select * from update_pending_subscription_billing_term($1,$2,$3,12)',[b,owner,id]);assert.equal(Number((await row(id)).discount_percent),10);
   await db.query('select * from update_pending_subscription_billing_term($1,$2,$3,3)',[b,owner,id]);assert.equal(Number((await row(id)).discount_percent),30);
   await db.query("update subscription_orders set payment_provider='aba_payway' where id=$1",[id]);
   await assert.rejects(db.query('select * from update_pending_subscription_billing_term($1,$2,$3,1)',[b,owner,id]),/locked after payment/);
  });
  await check('reactivation approval restores access with the discounted cycle',async()=>{
   await db.exec("update businesses set subscription_status='expired',is_active=false,disabled_reason='subscription_expired'");await offer({percent:20,newCustomer:false});const id=await quote();await submit(id);await approve(id);
   const business=(await db.query('select * from businesses')).rows[0];assert.equal(business.subscription_status,'active');assert.equal(business.is_active,true);assert.equal(Number(business.subscription_cycle_value),24);
  });
  await check('renewal offer is locked but waits until the existing term ends',async()=>{
   await active();await offer({percent:20,newCustomer:false});const id=await quote();const order=await row(id);assert.equal(order.order_kind,'renewal');assert.equal(Number(order.total_amount),24);
   await submit(id);await approve(id);assert.equal((await row(id)).activated_at,null);assert.equal(Number((await db.query('select subscription_cycle_value from businesses')).rows[0].subscription_cycle_value),28.5);
  });
  await check('duration-only renewal can change again at checkout without changing capacity or paid expiry',async()=>{
   await active();await offer({plan:'solo',months:6,percent:20});
   const id=await quote('solo',1);const original=await row(id);
   for(const months of [3,6,12,1]){
    await db.query('select * from update_pending_subscription_billing_term($1,$2,$3,$4)',[b,owner,id,months]);
    const order=await row(id);const discount=months===6?20:months===12?10:months===3?5:0;
    assert.equal(order.term_months,months);assert.equal(Number(order.total_amount),Number((10*months*(1-discount/100)).toFixed(2)));
    assert.equal(new Date(order.effective_at).getTime(),new Date(original.effective_at).getTime());
    assert.equal(order.requested_user_limit,original.requested_user_limit);assert.equal(order.requested_branch_limit,original.requested_branch_limit);
   }
   await db.exec('savepoint no_zero');await assert.rejects(db.query('select * from update_pending_subscription_billing_term($1,$2,$3,0)',[b,owner,id]),/Choose 1, 3, 6 or 12/);await db.exec('rollback to no_zero');
   await db.query("update subscription_orders set payment_provider='aba_payway' where id=$1",[id]);
   await assert.rejects(db.query('select * from update_pending_subscription_billing_term($1,$2,$3,3)',[b,owner,id]),/locked after payment/);
  });
  await check('PayWay accepts the locked discounted amount after expiry and is idempotent',async()=>{
   await offer({percent:30});const id=await quote();await db.query("update subscription_orders set payment_provider='aba_payway',payway_tran_id='TEST',payway_started_at=now() where id=$1",[id]);
   await db.exec('update subscription_promotions set enabled=false');
   const confirm=async amount=>(await db.query("select confirm_payway_subscription_order($1,$2,'TEST',$3,'USD') result",[b,id,amount])).rows[0].result;
   await db.exec('savepoint wrong_amount');await assert.rejects(confirm(20),/amount does not match/);await db.exec('rollback to wrong_amount');
   assert.equal((await confirm(21)).status,'approved');assert.equal((await confirm(21)).alreadyConfirmed,true);
  });
  await check('tampered discount is rejected by approval',async()=>{
   await offer({percent:30});const id=await quote();await submit(id);await db.query('update subscription_orders set discount_percent=50,term_price_amount=15,extension_amount=15,total_amount=15 where id=$1',[id]);await assert.rejects(approve(id),/pricing does not match/);
  });
  await check('ordinary term pricing is restored after promotion expiration for new quotes',async()=>{
   await offer({percent:30});const first=await quote();await db.exec("update subscription_promotions set starts_on=current_date-2,ends_on=current_date-1");
   const second=await quote();assert.equal(Number((await row(first)).total_amount),21);assert.equal(Number((await row(second)).total_amount),28.5);
  });
  await check('customer cannot read or change promotion rules or quote snapshots',async()=>{
   assert.equal((await db.query("select has_table_privilege('authenticated','subscription_promotions','INSERT') allowed")).rows[0].allowed,false);
   assert.equal((await db.query("select has_table_privilege('authenticated','subscription_order_discounts','UPDATE') allowed")).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege('service_role','tenh_record_subscription_discount(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
   await db.exec("set local test.auth_role='authenticated'");await assert.rejects(quote(),/Server access/);
  });
  await check('buying during trial preserves unused trial time and applies purchased capacity',async()=>{
   await db.exec("update businesses set trial_expires_at=now()+interval '5 days',subscription_branch_limit=1");
   const id=await quote('custom',1,5,2);const order=await row(id);
   assert.equal(order.order_kind,'activation');assert.equal(Number(order.total_amount),38);
   await submit(id);await approve(id);
   const business=(await db.query('select * from businesses')).rows[0];
   assert.equal(business.subscription_user_limit,5);assert.equal(business.subscription_branch_limit,2);
   const expected=(await db.query("select now()+interval '1 month'+interval '5 days' expiry")).rows[0].expiry;
   assert.ok(Math.abs(new Date(business.subscription_expires_at)-new Date(expected))<2000);
  });
  await check('capacity-only upgrade charges proration and preserves paid expiry exactly',async()=>{
   await active();const before=(await db.query('select subscription_expires_at from businesses')).rows[0].subscription_expires_at;
   const id=await quote('custom',0,5,2);const order=await row(id);
   assert.equal(Number(order.term_price_amount),0);assert.equal(Number(order.total_amount),Number(order.upgrade_prorated_amount));
   await submit(id);await approve(id);
   const business=(await db.query('select * from businesses')).rows[0];
   assert.equal(new Date(business.subscription_expires_at).getTime(),new Date(before).getTime());
   assert.equal(business.subscription_user_limit,5);assert.equal(business.subscription_branch_limit,2);
  });
  await check('downgrade waits until expiry and applies lower user and branch allowances only when due',async()=>{
   await active();await db.exec("update businesses set subscription_plan_key='custom',subscription_user_limit=10,subscription_branch_limit=3,subscription_monthly_price=78");
   await db.query("insert into business_members(business_id,user_id,role,is_active,created_at) values($1,'44444444-4444-4444-8444-444444444444','staff',true,now())",[b]);
   await db.query("insert into business_locations(business_id,name,is_default,is_active,created_at) values($1,'Extra',false,true,now())",[b]);
   const id=await quote('solo',1,1,1);const order=await row(id);
   assert.equal(order.order_kind,'renewal');assert.equal(Number(order.total_amount),10);
   await submit(id);await approve(id);
   let business=(await db.query('select * from businesses')).rows[0];
   assert.equal(business.subscription_user_limit,10);assert.equal(business.subscription_branch_limit,3);
   assert.equal((await db.query('select count(*)::int n from business_members where is_active')).rows[0].n,2);
   assert.equal((await db.query('select count(*)::int n from business_locations where is_active')).rows[0].n,2);
   assert.equal((await row(id)).activated_at,null);
   await db.query("update subscription_orders set effective_at=now()-interval '1 second' where id=$1",[id]);
   await db.query('select tenh_apply_subscription_order($1)',[id]);
   business=(await db.query('select * from businesses')).rows[0];
   assert.equal(business.subscription_user_limit,1);assert.equal(business.subscription_branch_limit,1);
   assert.equal((await db.query('select count(*)::int n from business_members where is_active')).rows[0].n,1);
   assert.equal((await db.query('select count(*)::int n from business_locations where is_active')).rows[0].n,1);
   assert.equal((await db.query("select is_active from business_members where user_id=$1",[owner])).rows[0].is_active,true);
   assert.equal((await db.query("select is_active from business_locations where is_default")).rows[0].is_active,true);
   assert.equal((await db.query('select tenh_apply_subscription_order($1) result',[id])).rows[0].result.status,'already_applied');
  });
  await check('custom server pricing covers user and branch boundaries for every duration',async()=>{
   for(const users of [1,2,5,6,10,11,500])for(const branches of [1,2,100])for(const months of [1,3,6,12]){
    const monthly=(users<=5?10+(users-1)*2:users<=10?18+(users-5)*4:38+(users-10)*5)+(branches-1)*20;
    const discount=({1:0,3:5,6:8,12:10})[months];const order=await row(await quote('custom',months,users,branches));
    assert.equal(Number(order.monthly_price),monthly);assert.equal(Number(order.total_amount),Number((monthly*months*(1-discount/100)).toFixed(2)));
   }
  });
  console.log(`${count} subscription promotion integration checks passed.`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
