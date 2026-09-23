import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTs,queryDouble} from './helpers/load-ts.cjs';
const B='10000000-0000-4000-8000-000000000001',U='20000000-0000-4000-8000-000000000001',O='30000000-0000-4000-8000-000000000001';
const plans=loadTs('lib/subscriptions/plans.ts');
const selection=loadTs('lib/subscriptions/checkout-input.ts',{'./plans':plans});
const rollback=loadTs('lib/operations/rpc-outcome.ts');
function form(values){const f=new FormData();for(const [k,v]of Object.entries(values))if(v!==null)f.set(k,String(v));return f;}
for(const [plan,users]of [['solo',1],['small_team',5],['growth',10]]) test(`standard ${plan} uses authoritative seats/branch rather than hidden fields`,()=>{
 const s=selection.subscriptionSelection(form({plan,termMonths:3,userLimit:99,branchLimit:5,total_amount:0}));
 assert.deepEqual(s,{plan,term:3,users,branches:1});
});
for(const users of [1,2,5,10,11,100,500])test(`Custom accepts supported user count ${users}`,()=>{
 assert.equal(selection.subscriptionSelection(form({plan:'custom',termMonths:12,userLimit:users,branchLimit:2})).users,users);
});
for(const patch of [{userLimit:0},{userLimit:501},{userLimit:1.5},{userLimit:'1e2'},{userLimit:''},{branchLimit:0},{branchLimit:101},{branchLimit:1.2},{termMonths:2},{termMonths:''},{termMonths:null},{userLimit:null}])test(`reject invalid custom selection ${JSON.stringify(patch)}`,()=>{
 assert.throws(()=>selection.subscriptionSelection(form({plan:'custom',termMonths:1,userLimit:1,branchLimit:1,...patch})));
});
test('old constraint errors explain the targeted migration',()=>{
 assert.match(selection.subscriptionFailure({message:'violates check constraint "subscription_orders_user_limit_check"'}),/20260921120000/);
 assert.match(selection.subscriptionFailure({code:'PGRST202'}),/existing subscription is unchanged/i);
});
function actions(options={}) {
 const calls=[],queries=[],deletes=[];const order={id:O,status:'pending_payment',total_amount:45,payment_method:'manual',proof_bucket:'tenh-pos-subscription-payment-proofs',proof_path:`${B}/${O}/proof.png`,pricing_locked_until:'2099-01-01',...options.order};
 const admin={async rpc(name,args){calls.push({name,args});
   if(name==='tenh_subscription_safety_ready')return options.ready ?? {data:true,error:null};
   if(name==='create_branch_subscription_order')return options.quote ?? {data:[{order_id:O,order_status:'pending_payment'}],error:null};
   if(name==='tenh_subscription_payment')return options.payment ?? {data:O,error:null};
   throw Error('Unexpected RPC '+name);
 },from(table){assert.equal(table,'subscription_orders');return queryDouble(table,{data:order,error:null},queries);},storage:{from(){return{upload:async()=>({error:null}),remove:async paths=>{deletes.push(...paths);return {error:null};}};}}};
 const api=loadTs('app/(dashboard)/dashboard/settings/subscription/actions.ts',{
  '@/lib/subscriptions/checkout-input':selection,
  '@/lib/operations/rpc-outcome':rollback,
  'node:crypto':{randomUUID:()=>O},'next/cache':{revalidatePath(){if(options.cacheError)throw Error('cache offline');}},
  'next/navigation':{redirect(path){throw Object.assign(new Error('REDIRECT'),{destination:path});}},
  '@/lib/business/get-current-business':{getCurrentBusinessForSubscription:async()=>({id:B,role:options.role??'owner'})},
  '@/lib/tenancy/domain':{getAppUrl:p=>p},'@/lib/supabase/admin':{supabaseAdmin:admin},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.noUser?null:{id:U}}})}})},
  '@/lib/subscriptions/trial-protection':{checkTrialRegistrationEligibility:()=>{throw Error('Trial must not run');},recordTrialSignupEvent:()=>{throw Error('Trial must not run');}},
 });return{api,calls,queries,deletes};
}
const custom=()=>form({expectedBusinessId:B,plan:'custom',termMonths:1,userLimit:1,branchLimit:2});
test('custom checkout reaches the branch RPC with one user; no old-plan fallback or price input',async()=>{
 const h=actions();await assert.rejects(h.api.createSubscriptionOrder(custom()),e=>e.destination===`/dashboard/settings/subscription/payment/${O}`);
 assert.equal(h.calls[1].name,'create_branch_subscription_order');assert.equal(h.calls[1].args.p_requested_user_limit,1);assert.equal(h.calls[1].args.p_requested_branch_limit,2);assert.equal(h.calls[1].args.p_base_plan_key,null);
 assert.ok(!h.calls.some(c=>c.name==='create_subscription_order'));assert.ok(!('p_total_amount' in h.calls[1].args));
});
test('missing safety migration fails closed instead of old checkout fallback',async()=>{
 const h=actions({ready:{data:null,error:{code:'PGRST202'}}});const r=await h.api.submitSubscriptionSelection({error:null},custom());assert.match(r.error,/20260921120000/);assert.equal(h.calls.length,1);
});
test('constraint rejection is an inline state, not an unhandled form exception',async()=>{
 const h=actions({quote:{data:null,error:{code:'23514',message:'subscription_orders_user_limit_check'}}});const r=await h.api.submitSubscriptionSelection({error:null},custom());assert.match(r.error,/migration|20260921120000/);
});
test('success redirect is outside action error handling',async()=>{
 const h=actions();await assert.rejects(h.api.submitSubscriptionSelection({error:null},custom()),e=>e.destination===`/dashboard/settings/subscription/payment/${O}`);
});
test('committed quote remains successful despite cache invalidation error',async()=>{
 const h=actions({cacheError:true});await assert.rejects(h.api.createSubscriptionOrder(custom()),e=>Boolean(e.destination));
});
test('staff cannot quote subscriptions',async()=>{
 const h=actions({role:'cashier'});const r=await h.api.submitSubscriptionSelection({error:null},custom());assert.match(r.error,/owner/);assert.equal(h.calls.length,0);
});
test('no signed-in user cannot create quote',async()=>{
 const h=actions({noUser:true});const r=await h.api.submitSubscriptionSelection({error:null},custom());assert.match(r.error,/session expired/);assert.equal(h.calls.length,0);
});
test('payment method uses locked payment RPC scoped to server business/user',async()=>{
 const h=actions();await assert.rejects(h.api.selectSubscriptionPaymentMethod(form({orderId:O,paymentMethod:'manual'})),e=>Boolean(e.destination));
 assert.deepEqual(h.calls[0],{name:'tenh_subscription_payment',args:{p_business_id:B,p_user_id:U,p_order_id:O,p_action:'method',p_input:{method:'manual'}}});
});
test('proof submission is atomic in the server-scoped RPC; does not activate a business',async()=>{
 const h=actions();await h.api.submitSubscriptionPayment(form({orderId:O,paymentNote:'Payment checked'}));assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.p_action,'submit');assert.equal(h.calls[0].args.p_user_id,U);assert.equal(h.queries[0].table,'subscription_orders');assert.equal(h.deletes.length,0);
});
test('already-submitted proof is not resubmitted or deleted on retry',async()=>{
 const h=actions({order:{status:'payment_submitted'}});await h.api.submitSubscriptionPayment(form({orderId:O,paymentNote:'Same payment'}));assert.equal(h.calls.length,0);assert.equal(h.deletes.length,0);
});
test('expired pending price is not submitted and does not get an unlocked cancellation',async()=>{
 const h=actions({order:{pricing_locked_until:'2020-01-01'}});await assert.rejects(h.api.submitSubscriptionPayment(form({orderId:O,paymentNote:'Pay'})),/expired/);assert.equal(h.calls.length,0);assert.ok(h.queries.every(q=>!q.steps.some(s=>s[0]==='update')));
});
// Structural contracts complement, but never substitute for, the PGlite test.
test('SQL has bounded new-plan checks, no RLS bypass grant, legacy-safe validation and one locked lifecycle',()=>{
 const sql=fs.readFileSync('supabase/migrations/20260921120000_subscription_upgrade_safety.sql','utf8');
 assert.match(sql,/ADD CONSTRAINT subscription_orders_user_limit_check\s+CHECK \(requested_user_limit BETWEEN 1 AND 500\)/);
 assert.match(sql,/VALIDATE CONSTRAINT subscription_orders_user_limit_check/);
 assert.match(sql,/payment_submitted_at>o.pricing_locked_until/);
 assert.match(sql,/source_subscription_snapshot IS DISTINCT FROM public.tenh_subscription_snapshot\(b\)/);
 assert.match(sql,/alreadyReviewed/);assert.match(sql,/pricing_version=4/);
 assert.doesNotMatch(sql,/DISABLE\s+ROW\s+LEVEL|DROP\s+TABLE|TRUNCATE|GRANT.*TO\s+(anon|authenticated)/i);
});

test('a stale plans form cannot buy for a different active business',async()=>{
 const h=actions();const input=custom();input.set('expectedBusinessId',O);
 const result=await h.api.submitSubscriptionSelection({error:null},input);assert.match(result.error,/active business changed/);assert.equal(h.calls.length,0);
});
test('a missing purchase origin fails closed',async()=>{
 const h=actions();const input=custom();input.delete('expectedBusinessId');
 assert.match((await h.api.submitSubscriptionSelection({error:null},input)).error,/stale/);assert.equal(h.calls.length,0);
});
test('a saved proof is not reported as failed when cache invalidation fails',async()=>{
 const h=actions({cacheError:true});await h.api.submitSubscriptionPayment(form({orderId:O,paymentNote:'Paid once'}));assert.equal(h.calls.length,1);
});
function reviewActions(options={}) {
 const log=[],calls=[];
 const order={id:O,business_id:B,pricing_version:4,status:'payment_submitted',payment_note:'Paid',proof_bucket:'bucket',proof_path:'proof',requested_by_user_id:U,total_amount:45,currency:'USD',...options.order};
 const admin={from(table){
   if(table==='subscription_orders')return queryDouble(table,{data:order,error:null},log);
   return {insert:async()=>{log.push({table,op:'insert'});if(options.postCommitError)throw Error('audit unavailable');return {error:null};},upsert:async()=>{log.push({table,op:'upsert'});return {error:null};}};
 },async rpc(name,args){calls.push({name,args});return options.result??{data:{status:'approved',new_expiry:'2099-01-01'},error:null};}};
 const api=loadTs('app/(super-admin)/super-admin/subscription-payments/actions.ts',{
  'next/cache':{revalidatePath(){}},'@/lib/auth/require-super-admin':{requireSuperAdmin:async()=>({id:U,email:'test@example.invalid'})},'@/lib/supabase/admin':{supabaseAdmin:admin},
 });return {api,log,calls};
}
test('v4 approval never falls back to the legacy review when migration is missing',async()=>{
 const h=reviewActions({result:{data:null,error:{code:'PGRST202',message:'Missing migration'}}});await assert.rejects(h.api.reviewSubscriptionPayment(form({orderId:O,decision:'approve'})),/Missing migration/);assert.equal(h.calls.length,1);
});
test('approved retry does not duplicate audit or notification writes',async()=>{
 const h=reviewActions({order:{status:'approved'},result:{data:{status:'approved',alreadyReviewed:true},error:null}});await h.api.reviewSubscriptionPayment(form({orderId:O,decision:'approve'}));assert.ok(h.log.every(x=>!x.op));
});
test('committed approval is not reported as rolled back by ancillary failure',async()=>{
 const h=reviewActions({postCommitError:true});await h.api.reviewSubscriptionPayment(form({orderId:O,decision:'approve'}));assert.equal(h.calls.length,1);
});
test('an unknown approval result does not produce false success notifications',async()=>{
 const h=reviewActions({result:{data:null,error:null}});await assert.rejects(h.api.reviewSubscriptionPayment(form({orderId:O,decision:'approve'})),/could not be confirmed/);assert.ok(h.log.every(x=>!x.op));
});
