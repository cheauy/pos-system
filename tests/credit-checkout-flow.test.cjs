const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
function nodes(root){if(!root||typeof root!=='object')return [];if(Array.isArray(root))return root.flatMap(nodes);return [root,...nodes(root.props?.children)];}
const id='11111111-1111-4111-8111-111111111111';
const expiry=loadTs('lib/subscriptions/payment-expiry.ts',{'server-only':{},'@/lib/payway/server':{},'@/lib/supabase/admin':{}});
test('credit checkout shares the plan countdown and offers cancellation before selecting either method',async()=>{
 const Countdown=()=>null,Selector=()=>null,Payway=()=>null,cancel=()=>{};
 const Page=loadTs('app/(dashboard)/dashboard/settings/business/payment/[orderId]/credit-checkout.tsx',{
  'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{default:()=>null},'lucide-react':require('lucide-react'),
  '@/lib/subscriptions/entitlements':{getBusinessChangeEntitlements:async()=>({urlCredits:1,modeCredits:1})},
  '../../../subscription/payment/[orderId]/payment-method-selector':{default:Selector},'../../../subscription/payment/[orderId]/payway-checkout-button':{default:Payway},
  '../../../subscription/manual-payment-status-watcher':{default:()=>null},'../../../subscription/manual-payment-qr-preview':{default:()=>null},'./payment-form':{default:()=>null},
  '../../actions':{cancelBusinessChangeCheckout:cancel},'../../../subscription/payment-request-countdown':{default:Countdown},
  '@/components/ui/pending-submit-button':{PendingSubmitButton:()=>null},'@/lib/subscriptions/payment-expiry':expiry,
 }).default;
 const base={id,credit_purchase:true,status:'pending_payment',change_url:true,total_amount:5,payment_provider:null,payment_expires_at:new Date(Date.now()+600000).toISOString(),created_at:new Date().toISOString()};
 for(const provider of [null,'aba_payway']){
   const tree=nodes(await Page({order:{...base,payment_provider:provider},businessId:'business'}));
   assert.ok(tree.some(n=>n.type===Countdown&&n.props.kind==='business_change'));
   assert.ok(tree.some(n=>n.type==='form'&&n.props.action===cancel));assert.ok(tree.some(n=>n.type===(provider?Payway:Selector)));
 }
 for(const status of ['paid','payment_submitted','cancelled','under_review']){
   const tree=nodes(await Page({order:{...base,status},businessId:'business'}));assert.ok(!tree.some(n=>n.type===Countdown||n.type===Selector||n.type===Payway||n.props.action===cancel));
 }
 const expired=nodes(await Page({order:{...base,payment_expires_at:'2020-01-01'},businessId:'business',expiryCheckFailed:true}));
 assert.ok(!expired.some(n=>n.type===Selector||n.type===Payway));assert.ok(expired.some(n=>n.props.children==='Payment window ended'));
});

function actions(order,providerResult={state:'cancelled'},saved=true){
 const log=[],providerCalls=[];
 const api=loadTs('app/(dashboard)/dashboard/settings/business/actions.ts',{
  'node:crypto':require('node:crypto'),'next/cache':{revalidatePath(){}},'next/navigation':{redirect(path){throw Object.assign(Error(path),{redirect:true});}},
  'next/dist/client/components/redirect-error':{isRedirectError:e=>e.redirect},'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',role:'owner'})},
  '@/lib/audit/create-audit-log':{},'@/lib/business/business-mode-presets':{},'@/lib/supabase/server':{},'@/lib/tenancy/store-slug-availability':{},'@/lib/subscriptions/manual-bank':{},
  '@/lib/subscriptions/payment-expiry':expiry,'@/lib/payway/server':{cancelSubscriptionPaywayCheckout:async args=>{providerCalls.push(args);return providerResult;}},
  '@/lib/supabase/admin':{supabaseAdmin:{from(){let writing=false;const q={};for(const op of ['select','eq','is','update'])q[op]=(...args)=>{log.push([op,...args]);if(op==='update')writing=true;return q;};q.maybeSingle=async()=>({data:writing?(saved?{id}:null):{id,credit_purchase:true,...order}});return q;}}},
 });return {api,log,providerCalls};
}
const cancelForm=()=>{const f=new FormData();f.set('orderId',id);return f;};
test('manual/unstarted cancellation is scoped and conditional; races cannot cancel a submitted payment',async()=>{
 const h=actions({status:'pending_payment'});await assert.rejects(h.api.cancelBusinessChangeCheckout(cancelForm()),e=>e.redirect&&e.message==='/dashboard/settings/business');
 for(const [key,value] of [['business_id','business'],['status','pending_payment']])assert.ok(h.log.some(s=>s[0]==='eq'&&s[1]===key&&s[2]===value));
 for(const key of ['proof_path','payment_provider','payway_tran_id'])assert.ok(h.log.some(s=>s[0]==='is'&&s[1]===key&&s[2]===null));assert.equal(h.providerCalls.length,0);
 const raced=actions({status:'pending_payment'},null,false);await assert.rejects(raced.api.cancelBusinessChangeCheckout(cancelForm()),/cancel=unavailable/);
 for(const status of ['paid','payment_submitted','under_review']){const locked=actions({status});await assert.rejects(locked.api.cancelBusinessChangeCheckout(cancelForm()),new RegExp('/payment/'+id));assert.equal(locked.log.filter(s=>s[0]==='update').length,0);}
});
test('ABA cancellation preserves approved or unverifiable payments and uses credit kind',async()=>{
 for(const state of ['approved','provider_close_unavailable','cancelled']){
   const h=actions({status:'pending_payment',payment_provider:'aba_payway',payway_tran_id:'TRAN'},{state});
   await assert.rejects(h.api.cancelBusinessChangeCheckout(cancelForm()),e=>e.redirect&&(state==='cancelled'?e.message==='/dashboard/settings/business':e.message.includes('/payment/'+id)));
   assert.equal(h.providerCalls[0].kind,'business_change');assert.equal(h.providerCalls[0].businessId,'business');assert.equal(h.log.filter(s=>s[0]==='update').length,0);
 }
});
