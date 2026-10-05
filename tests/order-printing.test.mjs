import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const {loadTs}=require('./helpers/load-ts.cjs');
const contact=loadTs('lib/orders/order-contact.ts');
const orderModel=loadTs('app/(dashboard)/dashboard/orders/[id]/order-detail-model.ts',{'@/lib/orders/order-payment':loadTs('lib/orders/order-payment.ts'),'@/lib/orders/order-contact':contact});
const printPreparation=loadTs('lib/printing/prepare-print.ts', {'@/lib/receipts/shipping-layout':loadTs('lib/receipts/shipping-layout.ts')});
const source=readFileSync(new URL('../components/print-button.tsx',import.meta.url),'utf8');
function button(content,fonts=Promise.resolve()) {
 const errors=[]; let prints=0;
 const deps={react:{useRef:()=>({current:false}),useState:initial=>[initial,value=>{if(typeof value==='string'&&value)errors.push(value);}]},'lucide-react':{Printer:()=>null},'@/lib/printing/prepare-print':printPreparation};
 const testModule={exports:{}};
 const {outputText}=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
 new Function('require','module','exports',outputText)(id=>deps[id]??require(id),testModule,testModule.exports);
 globalThis.document={querySelector:()=>content,fonts:{ready:fonts}};
 globalThis.window={document:globalThis.document,focus:()=>{},print:()=>prints++};
 const tree=testModule.exports.default({});
 return {click:tree.props.children[0].props.onClick,errors,prints:()=>prints};
}
test('print waits for fonts and images, suppresses duplicate clicks',async()=>{
 let ready;const fonts=new Promise(resolve=>ready=resolve);let decoded=false;
 const b=button({querySelectorAll:selector=>selector==='img'?[{decode:async()=>{decoded=true;},naturalWidth:600}]:[]},fonts);
 const first=b.click();await b.click();assert.equal(b.prints(),0);ready();await first;assert.equal(decoded,true);assert.equal(b.prints(),1);
});
test('missing preview never opens printer dialog',async()=>{const b=button(null);await b.click();assert.equal(b.prints(),0);assert.match(b.errors[0],/unavailable/);});
test('broken uploaded logo blocks printing',async()=>{const b=button({querySelectorAll:()=>[{decode:async()=>{throw Error('broken');}}]});await b.click();assert.equal(b.prints(),0);assert.match(b.errors[0],/could not load/);});
test('oversize shipping label is warned on screen but still prints (user accepts clipping)',async()=>{const b=button({querySelectorAll:selector=>selector==='.shipping-label'?[{dataset:{widthMm:'80',heightMm:'50'},getBoundingClientRect:()=>({width:320,height:300})}]:[]});await b.click();assert.equal(b.prints(),1);assert.equal(b.errors.filter(Boolean).length,0);});

test('reprinting a saved sale refreshes customer contact while preserving original transaction amounts',()=>{
 const original={orderId:'order-1',customerName:'Old customer',total:90,amountPaid:100,remaining:0,change:10,currency:'USD',taxAmount:5,lines:[{name:'Original item',quantity:1,unitPrice:90,subtotal:90}],tenders:[{method:'cash',amount:100}],shipping:{method:'delivery',recipientName:'Old customer',phone:'old-phone',address:'Old street',carrier:'other',carrierOther:'Jalat'},note:'Original note'};
 const before=structuredClone(original),customer={name:'Updated សុភា',phone:'012345678',address:'Updated street'};
 const order={id:'order-1',order_code:'482193057716',guest_name:'Old guest',guest_phone:'old-guest-phone',guest_address:'Old guest street',customers:customer,total:50,amount_paid:20,remaining_balance:30,customer_note:'Updated note',pos_checkout:{receipt:original}};
 for(const customers of [customer,[customer]]){
  const printed=orderModel.recordReceipt({...order,customers},'Shop','USD','Main');
  assert.equal(printed.customerName,customer.name);assert.equal(printed.shipping.recipientName,customer.name);assert.equal(printed.shipping.phone,customer.phone);assert.equal(printed.shipping.address,customer.address);
  assert.equal(printed.note,'Updated note');assert.equal(printed.orderCode,order.order_code);
  for(const key of ['total','amountPaid','remaining','change','taxAmount','currency','lines','tenders'])assert.deepEqual(printed[key],original[key]);
  assert.equal(printed.shipping.carrierOther,'Jalat');assert.deepEqual(original,before);
 }
 const guest=orderModel.recordReceipt({...order,customers:null,guest_name:'Updated guest',guest_phone:'new-guest-phone',guest_address:'New guest street'},'Shop','USD','Main');
 assert.equal(guest.customerName,'Updated guest');assert.equal(guest.shipping.phone,'new-guest-phone');assert.equal(guest.shipping.address,'New guest street');
 const cleared=orderModel.recordReceipt({...order,customers:{name:customer.name,phone:null,address:''}},'Shop','USD','Main');
 assert.equal(cleared.shipping.phone,'');assert.equal(cleared.shipping.address,'');
});

test('orders without a valid sale snapshot use current contact and preserve their saved shipping carrier',()=>{
 const order={id:'current-order',order_number:'ORDER-NEW',created_at:'2026-10-04T03:00:00Z',fulfillment_type:'delivery',guest_name:'New guest',guest_phone:'01234',guest_address:'New street',customer_note:'New note',total:25,amount_paid:10,remaining_balance:15,order_items:[],pos_checkout:{receipt:{orderId:'different-order',lines:[],total:999,shipping:{method:'pickup',carrier:'grab'}},shipping:{method:'delivery',carrier:'jt'}}};
 const printed=orderModel.recordReceipt(order,'Shop','USD','Main');
 assert.equal(printed.customerName,'New guest');assert.equal(printed.shipping.phone,'01234');assert.equal(printed.shipping.address,'New street');assert.equal(printed.shipping.method,'delivery');assert.equal(printed.shipping.carrier,'jt');
 assert.equal(printed.total,25);assert.equal(printed.amountPaid,10);assert.equal(printed.remaining,15);assert.equal(printed.isOrderRecord,true);
});
