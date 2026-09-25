const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const base='app/(dashboard)/dashboard/settings/subscription/payment/[orderId]/';
const id='11111111-1111-4111-8111-111111111111';
function load(role='owner',signedIn=true){
  const calls=[];const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'payway-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require(name){
    if(name.includes('get-current-business'))return {getCurrentBusinessForSubscription:async()=>({id:'trusted-business',role})};
    if(name.includes('supabase/server'))return {createClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{email:'owner@example.com'}:null}})}})};
    if(name.includes('payway/server'))return {prepareSubscriptionPaywayCheckout:async args=>{calls.push(['start',args]);return {alreadyPaid:false,fields:{},purchaseUrl:'https://example.com'};},verifyAndConfirmSubscriptionPaywayPayment:async args=>{calls.push(['verify',args]);return {state:'approved'};}};
    throw Error(name);
  }});return {api:exports,calls};
}
test('only signed-in owners can start or verify popup payments',async()=>{
  for(const [role,signedIn] of [['staff',true],['owner',false]]){
    const {api,calls}=load(role,signedIn);
    assert.ok((await api.startPaywayPopup(id)).error);
    assert.ok((await api.checkPaywayPopup(id)).error);
    assert.equal(calls.length,0);
  }
});
test('popup actions scope provider operations to the server-owned business',async()=>{
  const {api,calls}=load();
  assert.equal((await api.startPaywayPopup(id)).error,null);
  assert.equal((await api.checkPaywayPopup(id)).state,'approved');
  for(const [,args] of calls){assert.equal(args.businessId,'trusted-business');assert.equal(args.orderId,id);}
});
test('invalid order references cannot start a payment',async()=>{
  const {api,calls}=load();assert.ok((await api.startPaywayPopup('invalid')).error);assert.equal(calls.length,0);
});
test('legacy GET route does not create payments and popup posts only into its frame',()=>{
  const page=fs.readFileSync(base+'payway/page.tsx','utf8');
  assert.ok(!page.includes('prepareSubscriptionPaywayCheckout'));
  assert.ok(page.includes('?method=payway'));
  const popup=fs.readFileSync(base+'payway-checkout-button.tsx','utf8');
  assert.ok(popup.includes('target={`payway-${orderId}`}'));
  assert.ok(popup.includes('name={`payway-${orderId}`}'));
  assert.ok(!popup.includes('window.location'));
});
