import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs,queryDouble} from './helpers/load-ts.cjs';
test('COD and KHQR reject closed stores before uploads, orders or email',async()=>{
 for(const field of ['is_published','accept_online_orders'])for(const method of ['cod','khqr']){
  const log=[];
  const store={is_published:true,accept_online_orders:true,accept_cod:true,accept_khqr:true,[field]:false};
  const admin={from:table=>queryDouble(table,{data:table==='businesses'?{id:'business',is_active:true}:store,error:null},log),
   rpc:()=>assert.fail('Closed store created an order'),storage:{getBucket:()=>assert.fail('Closed store uploaded proof')}};
  const route=loadTs('app/api/storefront/[slug]/orders/route.ts',{
   '@/lib/storefront/order-email':{sendOrderEmail:()=>assert.fail('Closed store sent receipt')},
   '@/lib/storefront/checkout-validation':{PAYMENT_PROOF_BUCKET:'proofs',validateCheckoutEmail:()=>null,validateCheckoutContact:()=>null},
   'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
   '@/lib/supabase/admin':{supabaseAdmin:admin},
   '@/lib/tenancy/domain':{normalizeTenantSlug:value=>value,getTenantSlugFromHost:()=>null,getSubdomainUrl:()=>''}
  });
  const response=await route.POST({headers:new Headers(),json:async()=>({items:[{productId:'product',quantity:1}],guestName:'Customer',guestPhone:'012345678',guestEmail:'test@example.com',fulfillmentType:'pickup',paymentMethod:method})},{params:Promise.resolve({slug:'shop'})});
  assert.equal(response.status,400);assert.equal(response.body.success,false);assert.match(response.body.message,/not accepting/);
 }
});
test('order detail sums partial returns and fails closed when return history is unavailable',async()=>{
 for(const failure of [false,true])for(const sold of [3,5]){
  const calls=[],order={id:'order',order_number:'WEB-TEST',status:'completed',order_items:[{id:'item',product_name:'Shirt',quantity:sold,unit_price:10,subtotal:50}],created_at:'2026-09-24T00:00:00Z'};
  const db={from:table=>{const query=queryDouble(table,table==='orders'?{data:order}:table==='returns'?{data:failure?null:[{status:'refunded',return_items:[{order_item_id:'item',quantity:1},{order_item_id:'item',quantity:2}]}],error:failure?{message:'Unavailable'}:null,count:2}:{data:[]},calls);query.is=()=>query;return query;}};
  const api=loadTs('app/(dashboard)/dashboard/orders/order-workspace-data.ts',{'server-only':{},'@/lib/supabase/branch-server':{createClient:async()=>db}});
  const detail=await api.loadOrderDetail('business','order');
  assert.equal(detail.returnsUnavailable,failure);
  assert.equal(detail.items[0].returnedQuantity,failure?0:3);
  assert.ok(calls.find(call=>call.table==='orders').steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business'));
  assert.ok(calls.find(call=>call.table==='returns').steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business'));
  assert.equal(detail.status,!failure&&sold===3?'refunded':'completed');
  assert.equal(detail.paymentState,!failure&&sold===3?'refunded':'paid');
 }
});
test('return popup only reports success after a confirmed return and never navigates',()=>{
 for(const success of [false,true]){
  const effects=[],toasts=[],changes=[],ref={current:null};let refresh=0,returned=0;
  const api=loadTs('app/(dashboard)/dashboard/orders/[id]/return-items-form.tsx',{
   react:{useState:initial=>[initial,value=>changes.push(value)],useMemo:fn=>fn(),useRef:()=>ref,useEffect:fn=>effects.push(fn),useActionState:()=>[{success,returnId:success?'return-id':undefined,message:''},()=>{},false]},
   'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null,Fragment:'fragment'},
   'react-dom':{createPortal:()=>null},sonner:{toast:{success:message=>toasts.push(message)}},
   'next/navigation':{useRouter:()=>({refresh:()=>refresh++,push:()=>assert.fail('Return should not navigate')})},
   'lucide-react':{},'./return-actions':{createOrderReturn:()=>{}}
  });
  api.default({orderId:'order',orderNumber:'WEB-TEST',items:[{id:'item',product_name:'Shirt',quantity:2,unit_price:10,returned_quantity:0}],onReturned:()=>returned++});
  effects[0]();effects[0]();
  assert.equal(toasts.length,success?1:0);assert.equal(refresh,success?1:0);assert.equal(returned,success?1:0);
  if(success){assert.match(toasts[0],/Items returned.*Refund recorded/);assert.equal(changes[0],false);}
 }
});

test('return reason presets submit directly and Other requires a custom reason',()=>{
 const previousDocument=globalThis.document;
 globalThis.document={body:{}};
 try {
  for(const reason of ['Incorrect Size or Fit','Other']){
   let stateIndex=0;const states=[true,reason,'Custom reason',{}],nodes=[];
   const jsx=(type,props)=>{const node={type,props};nodes.push(node);return node;};
   const api=loadTs('app/(dashboard)/dashboard/orders/[id]/return-items-form.tsx',{
    react:{useState:()=>[states[stateIndex++],()=>{}],useMemo:fn=>fn(),useRef:()=>({current:null}),useEffect:()=>{},useActionState:()=>[{success:false,message:''},()=>{},false]},
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'react-dom':{createPortal:node=>node},
    sonner:{toast:{success:()=>{}}},'next/navigation':{useRouter:()=>({refresh:()=>{}})},'lucide-react':{},'./return-actions':{createOrderReturn:()=>{}}
   });
   api.default({orderId:'order',orderNumber:'TEST',items:[{id:'item',product_name:'Shirt',quantity:1,unit_price:10,returned_quantity:0}]});
   assert.equal(nodes.find(node=>node.type==='select'&&node.props.name==='reasonChoice').props.required,true);
   assert.equal(nodes.find(node=>node.type==='input'&&node.props.name==='reason').props.value,reason==='Other'?'Custom reason':reason);
   const custom=nodes.find(node=>node.type==='textarea'&&node.props.name==='otherReason');
   assert.equal(Boolean(custom),reason==='Other');
   if(custom){assert.equal(custom.props.required,true);assert.equal(custom.props.minLength,3);}
   for(const label of ['Incorrect Size or Fit','Defective or Damaged','Not as Described','Wrong Item Sent',"Buyer's Remorse / Changed Mind",'Other'])assert.ok(nodes.some(node=>node.type==='option'&&node.props.value===label));
  }
 } finally {if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
