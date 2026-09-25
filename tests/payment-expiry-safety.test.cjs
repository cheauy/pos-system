const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
function load(result){
  return loadTs('lib/subscriptions/payment-expiry.ts',{
    'server-only':{},
    '@/lib/payway/server':{cancelSubscriptionPaywayCheckout:async()=>result},
    '@/lib/supabase/admin':{supabaseAdmin:{from:()=>queryDouble('subscription_orders',{data:{id:'order',business_id:'business',status:'pending_payment',payment_provider:'aba_payway',payway_tran_id:'test',payment_expires_at:'2020-01-01'},error:null},[])}},
  });
}
test('failed provider close leaves expiry unresolved instead of claiming expired',async()=>{
  const api=load({state:'provider_close_unavailable',message:'Cannot verify cancellation'});
  const result=await api.expireSubscriptionPaymentRequestSafely({businessId:'business',orderId:'order'});
  assert.equal(result.state,'verification_required');assert.match(result.message,/Cannot verify/);
});
test('only confirmed cancellation expires a PayWay request; paid requests stay approved',async()=>{
  for(const state of ['expired','approved']){
    assert.equal((await load({state}).expireSubscriptionPaymentRequestSafely({businessId:'business',orderId:'order'})).state,state);
  }
});
