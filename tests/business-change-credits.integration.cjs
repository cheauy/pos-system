const fs=require('fs'),assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const before=require('./fixtures/business-change-before.json');
const migration=fs.readFileSync('supabase/migrations/20260925003000_business_change_credits.sql','utf8');
const business='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
(async()=>{const db=new PGlite();let checks=0;try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'service_role')$$;
 create table businesses(id uuid primary key,slug text,product_mode text,subscription_status text,subscription_plan_key text,free_url_changes_per_month int default 0,free_business_mode_changes_per_month int default 0,updated_at timestamptz);
 create table business_members(business_id uuid,user_id uuid,role text,is_active boolean);
 create table business_storefronts(business_id uuid constraint business_storefronts_pkey primary key,business_type text,updated_at timestamptz);`);
 await db.exec('create table business_change_orders('+before.filter(r=>r.kind==='column').map(r=>r.name+' '+r.body).join(',')+')');
 for(const r of before.filter(r=>r.kind==='constraint'&&!r.body.startsWith('FOREIGN KEY')))await db.exec(`alter table business_change_orders add constraint ${r.name} ${r.body}`);
 for(const r of before.filter(r=>r.kind==='function'))await db.exec(r.body);
 await db.exec(migration);await db.exec(migration);
 const separated=fs.readFileSync('supabase/migrations/20260925004000_separate_credit_purchase_and_apply.sql','utf8');
 await db.exec(separated);await db.exec(separated);
 await db.query("insert into businesses(id,slug,product_mode,subscription_status,subscription_plan_key) values($1,'shop','standard','active','solo')",[business]);
 await db.query("insert into business_members values($1,$2,'owner',true)",[business,owner]);
 await db.query("insert into business_storefronts values($1,'general',now())",[business]);
 const get=async()=> (await db.query('select * from businesses')).rows[0];
 const order=async id=>(await db.query('select * from business_change_orders where id=$1',[id])).rows[0];
 async function quote(url=true,mode=true,user=owner){const b=await get();const type=(await db.query('select business_type from business_storefronts')).rows[0].business_type;return(await db.query('select * from create_business_change_order_with_entitlement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[business,user,b.slug,url?b.slug+'new':b.slug,type,mode?(type==='general'?'fashion':'general'):type,b.product_mode,mode?(b.product_mode==='standard'?'variant':'standard'):b.product_mode,url,mode])).rows[0];}
 async function pay(id){await db.query("update business_change_orders set payment_provider='aba_payway',payway_tran_id=$2,payway_started_at=now(),payment_expires_at=now()+interval '10 minutes' where id=$1",[id,'BC'+id]);const o=await order(id);return db.query("select confirm_payway_business_change_order($1,$2,$3,$4,'USD')",[business,id,'BC'+id,o.total_amount]);}
 async function check(name,run){await db.exec('begin');try{await run();console.log('PASS '+name);checks++;}finally{await db.exec('rollback');}}
 await check('payment grants one credit of each type without changing business; replay grants nothing',async()=>{const q=await quote();assert.equal(Number(q.total_amount),10);await pay(q.order_id);await pay(q.order_id);const credits=(await db.query('select * from business_change_credits')).rows;assert.equal(credits.length,1);assert.equal(credits[0].url_remaining,1);assert.equal(credits[0].mode_remaining,1);assert.equal((await get()).slug,'shop');assert.equal((await get()).product_mode,'standard');});
 await check('credits persist past subscription expiry and are consumed once on confirmed change',async()=>{const q=await quote();await pay(q.order_id);await db.exec("update business_change_credits set created_at=now()-interval '2 years';update businesses set subscription_status='expired'");const applied=await quote();assert.equal(applied.order_status,'applied');assert.equal(Number(applied.total_amount),0);assert.equal((await get()).slug,'shopnew');assert.equal((await db.query('select url_remaining+mode_remaining n from business_change_credits')).rows[0].n,0);await db.query("select * from complete_business_change_order($1,'replay','aba_payway')",[q.order_id]);assert.equal((await db.query('select url_remaining+mode_remaining n from business_change_credits')).rows[0].n,0);assert.equal(Number((await quote()).total_amount),10);});
 await check('manual approval grants credit and duplicate approval is harmless',async()=>{const q=await quote(true,false);await db.query("update business_change_orders set status='payment_submitted',payment_note='Receipt submitted',proof_bucket='proof',proof_path='proof.png',proof_file_name='proof.png',proof_mime_type='image/png',proof_size_bytes=10,proof_uploaded_at=now() where id=$1",[q.order_id]);for(let i=0;i<2;i++)await db.query("select * from review_business_change_order($1,'approve',$2,'admin@test.invalid',null)",[q.order_id,owner]);assert.equal((await order(q.order_id)).status,'paid');assert.equal((await get()).slug,'shop');assert.equal((await db.query('select sum(url_remaining) n from business_change_credits')).rows[0].n,1);});
 await check('monthly allowance is used first and purchased credits remain available',async()=>{const q=await quote();await pay(q.order_id);await db.exec("update businesses set subscription_plan_key='growth',free_url_changes_per_month=2,free_business_mode_changes_per_month=2");await quote();assert.equal((await db.query('select url_remaining+mode_remaining n from business_change_credits')).rows[0].n,2);});
 await check('payment amount mismatch and expired payment cannot grant credits',async()=>{const q=await quote();await db.query("update business_change_orders set payment_provider='aba_payway',payway_tran_id='test',payway_started_at=now(),payment_expires_at=now()-interval '1 minute' where id=$1",[q.order_id]);await db.exec('savepoint invalid');await assert.rejects(db.query("select confirm_payway_business_change_order($1,$2,'test',1,'USD')",[business,q.order_id]));await db.exec('rollback to invalid');await assert.rejects(db.query("select confirm_payway_business_change_order($1,$2,'test',10,'USD')",[business,q.order_id]));await db.exec('rollback to invalid');assert.equal((await db.query('select * from business_change_credits')).rows.length,0);});
 await check('buying a missing second credit does not consume the credit already owned',async()=>{const first=await quote(true,false);await pay(first.order_id);const next=await quote(true,true);assert.equal(Number(next.total_amount),5);assert.equal((await order(next.order_id)).change_url,false);assert.equal((await db.query('select sum(url_remaining) n from business_change_credits')).rows[0].n,1);await pay(next.order_id);const applied=await quote();assert.equal(applied.order_status,'applied');assert.equal((await db.query('select sum(url_remaining+mode_remaining) n from business_change_credits')).rows[0].n,0);});
 await check('legacy paid change orders still apply rather than minting credits',async()=>{const q=await quote();await db.query('update business_change_orders set credit_purchase=false where id=$1',[q.order_id]);await db.query("select * from complete_business_change_order($1,'legacy-payment','manual_admin')",[q.order_id]);assert.equal((await order(q.order_id)).status,'applied');assert.equal((await get()).slug,'shopnew');assert.equal((await db.query('select * from business_change_credits')).rows.length,0);});
 await check('non-owner cannot create changes',async()=>{await assert.rejects(quote(true,false,'33333333-3333-4333-8333-333333333333'));});
 const buy=async(type,user=owner)=>(await db.query('select buy_business_change_credit($1,$2,$3) id',[business,user,type])).rows[0].id;
 const apply=async(url=true,mode=true)=>(await db.query("select * from apply_business_changes_with_credits($1,$2,'shop',$3,'general',$4,'standard',$5,$6,$7)",[business,owner,url?'newshop':'shop',mode?'fashion':'general',mode?'variant':'standard',url,mode])).rows[0];
 await check('buying credit with allowances creates checkout, reuses double-click, never changes settings',async()=>{
   await db.exec("update businesses set subscription_plan_key='growth',free_url_changes_per_month=2,free_business_mode_changes_per_month=2");
   const id=await buy('mode');assert.equal(await buy('mode'),id);
   const o=await order(id);assert.equal(Number(o.total_amount),5);assert.equal(o.credit_purchase,true);assert.equal(o.change_url,false);
   assert.equal((await get()).product_mode,'standard');await pay(id);
   assert.equal((await get()).product_mode,'standard');assert.equal((await db.query('select sum(mode_remaining) n from business_change_credits')).rows[0].n,1);
 });
 await check('Apply with insufficient credits rolls back all new orders and never starts checkout',async()=>{
   const id=await buy('url');await pay(id);const beforeCount=(await db.query('select count(*) n from business_change_orders')).rows[0].n;
   await db.exec('savepoint insufficient');await assert.rejects(apply(),/Not enough credits/);await db.exec('rollback to insufficient');
   assert.equal((await db.query('select count(*) n from business_change_orders')).rows[0].n,beforeCount);
   assert.equal((await db.query('select sum(url_remaining) n from business_change_credits')).rows[0].n,1);
   assert.equal((await get()).slug,'shop');
 });
 await check('Apply consumes two purchased credits and never creates a payment',async()=>{
   await pay(await buy('url'));await pay(await buy('mode'));const result=await apply();assert.equal(result.order_status,'applied');assert.equal(Number(result.total_amount),0);
   assert.equal((await get()).slug,'newshop');assert.equal((await get()).product_mode,'variant');
   assert.equal((await db.query('select sum(url_remaining+mode_remaining) n from business_change_credits')).rows[0].n,0);
   assert.equal((await db.query("select count(*) n from business_change_orders where status='pending_payment'")).rows[0].n,0);
 });
 await check('buy cannot bypass active payment, invalid type, owner or service role',async()=>{
   const id=await buy('url');await db.query("update business_change_orders set payment_provider='aba_payway' where id=$1",[id]);
   await db.exec('savepoint blocked');await assert.rejects(buy('mode'),/existing payment/);await db.exec('rollback to blocked');
   await assert.rejects(buy('invalid'),/valid credit/);await db.exec('rollback to blocked');
   await assert.rejects(buy('mode','33333333-3333-4333-8333-333333333333'),/owner/);await db.exec('rollback to blocked');
   await db.exec("set local test.role='authenticated'");await assert.rejects(buy('url'),/Server action/);
 });
 const deadline=fs.readFileSync('supabase/migrations/20260925005000_credit_checkout_deadline.sql','utf8');await db.exec(deadline);await db.exec(deadline);
 await check('new credit checkout has a fixed ten-minute deadline; refresh and PayWay start never extend it',async()=>{
   const id=await buy('url');const first=await order(id);assert.equal(new Date(first.payment_expires_at)-new Date(first.created_at),600000);
   assert.equal(await buy('url'),id);
   await db.query("update business_change_orders set payment_expires_at=now()+interval '1 hour' where id=$1",[id]);
   assert.equal(String((await order(id)).payment_expires_at),String(first.payment_expires_at));await pay(id);
   assert.equal((await order(id)).status,'paid');assert.equal((await get()).slug,'shop');
 });
 await check('expired credit checkout rejects manual proof and new PayWay transactions at the database boundary',async()=>{
   const id=await buy('mode');await db.exec('alter table business_change_orders disable trigger credit_checkout_deadline');
   await db.query("update business_change_orders set payment_expires_at=now()-interval '1 second' where id=$1",[id]);await db.exec('alter table business_change_orders enable trigger credit_checkout_deadline');
   await db.exec('savepoint expired');await assert.rejects(db.query("update business_change_orders set status='payment_submitted' where id=$1",[id]),/expired/);await db.exec('rollback to expired');
   await assert.rejects(db.query("update business_change_orders set payway_tran_id='NEW' where id=$1",[id]),/expired/);await db.exec('rollback to expired');
   await db.query("update business_change_orders set status='cancelled',payment_expired_at=now() where id=$1",[id]);assert.equal((await order(id)).status,'cancelled');
   assert.equal((await db.query('select count(*) n from business_change_credits')).rows[0].n,0);
 });
 console.log(`${checks} business-credit checks passed`);
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
