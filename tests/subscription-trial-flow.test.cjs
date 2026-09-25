const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
function setup({role='owner',status='trial_pending',allowed=true}={}){
  const calls=[];
  const api=loadTs('app/(dashboard)/dashboard/settings/subscription/actions.ts',{
    '@/lib/subscriptions/checkout-input':{},'@/lib/operations/rpc-outcome':{},'node:crypto':require('node:crypto'),
    'next/cache':{revalidatePath(){}},'next/navigation':{redirect:path=>{throw new Error('REDIRECT:'+path);}},
    '@/lib/business/get-current-business':{getCurrentBusinessForSubscription:async()=>({id:'business',role,subscriptionStatus:status})},
    '@/lib/tenancy/domain':{getAppUrl:x=>x},
    '@/lib/supabase/admin':{supabaseAdmin:{from:()=>queryDouble('businesses',{data:{subscription_status:'trialing'},error:null},[])}},
    '@/lib/payway/server':{},'@/lib/subscriptions/manual-bank':{},'@/lib/subscriptions/plans':{},'@/lib/subscriptions/payment-expiry':{},
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{email:'owner@example.com'}}})},rpc:async(name,args)=>{calls.push({name,args});return {error:null};}})},
    '@/lib/subscriptions/trial-protection':{checkTrialRegistrationEligibility:async()=>({allowed,fingerprintHash:'test'}),recordTrialSignupEvent:async()=>{}},
  });return {api,calls};
}
test('trial starts only on explicit action and through the guarded business RPC',async()=>{
  const {api,calls}=setup();assert.equal(calls.length,0);
  await assert.rejects(api.continueFreeTrial(new FormData()),/REDIRECT:\/dashboard$/);
  assert.deepEqual(calls,[{name:'ensure_business_trial_started',args:{p_business_id:'business'}}]);
});
test('staff, reused trials, expired accounts and blocked applicants cannot start a trial',async()=>{
  for(const options of [{role:'staff'},{status:'trialing'},{status:'active'},{status:'expired'},{status:'trial_blocked'},{allowed:false}]){
    const {api,calls}=setup(options);await assert.rejects(api.continueFreeTrial(new FormData()));assert.equal(calls.length,0);
  }
});
