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

test('ABA receipt downloads are permitted without allowing top-level navigation',()=>{
  const popup=fs.readFileSync(base+'payway-checkout-button.tsx','utf8');
  const permissions=popup.match(/<iframe[^>]*sandbox="([^"]+)"/)?.[1].split(/\s+/);
  assert.ok(permissions?.includes('allow-downloads'));
  assert.ok(!permissions.includes('allow-top-navigation'));
  assert.ok(!permissions.includes('allow-top-navigation-by-user-activation'));
});

function pollingPopup(kind,verify){
  const effects=[],timers=new Map(),updates=[],calls=[];let nextTimer=0,closed=0;
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'payway-checkout-button.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    exports,document:{activeElement:null},setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    require(name){
      if(name==='react')return {useEffect:fn=>effects.push(fn),useRef:current=>({current}),useState:initial=>[initial,value=>updates.push(value)]};
      if(name==='react/jsx-runtime')return require(name);
      if(name==='next/navigation')return {useRouter:()=>({})};
      if(name==='next/image')return {default:()=>null};
      if(name==='lucide-react')return require(name);
      if(name==='./payway-actions')return {checkPaywayPopup:async(...args)=>{calls.push(args);return verify();}};
      throw Error(name);
    }
  });
  const tree=exports.PaywayPopup({orderId:id,kind,checkout:{purchaseUrl:'https://example.com',fields:{}},onClose(){closed++;}});
  const cleanup=effects.map(fn=>fn());
  return {tree,timers,updates,calls,get closed(){return closed;},cleanup(){cleanup.forEach(fn=>fn?.());},async tick(){const [key,fn]=timers.entries().next().value;timers.delete(key);await fn();}};
}
for(const kind of ['subscription','business_change']){
  test(kind+': automatic checks wait through pending/scanned and close only after approval',async()=>{
    let state='pending';const h=pollingPopup(kind,()=>({state,error:null}));
    await h.tick();assert.equal(h.closed,0);assert.equal(h.timers.size,1);
    state='approved';await h.tick();assert.equal(h.closed,1);assert.equal(h.timers.size,0);
    assert.deepEqual(Array.from(h.calls[0]),[id,kind]);h.cleanup();
  });
}
test('automatic checks retry connection errors, stop for review and ignore replies after closing',async()=>{
  const h=pollingPopup('subscription',()=>{throw Error('network');});await h.tick();assert.equal(h.timers.size,1);assert.match(h.updates.at(-1),/Retrying/);h.cleanup();assert.equal(h.timers.size,0);
  const review=pollingPopup('business_change',()=>({state:'late_payment_review'}));await review.tick();assert.equal(review.timers.size,0);assert.equal(review.closed,0);assert.equal(review.updates.at(-1),false);review.cleanup();
  let resolve;const pending=pollingPopup('subscription',()=>new Promise(done=>resolve=done));const request=pending.tick();assert.equal(pending.timers.size,0);pending.cleanup();resolve({state:'approved'});await request;assert.equal(pending.closed,0);assert.equal(pending.timers.size,0);
});
