const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const payment=loadTs('lib/orders/order-payment.ts'),contact=loadTs('lib/orders/order-contact.ts');
const currency=loadTs('app/(dashboard)/dashboard/pos/pos-currency.ts',{'@/lib/currency-format':loadTs('lib/currency-format.ts')});
const helpers=loadTs('app/(dashboard)/dashboard/pos/pos-workspace-helpers.ts',{'./pos-currency':currency});
const customer=loadTs('app/(dashboard)/dashboard/pos/pos-customer-helpers.ts');
const qr={isOrderCode:()=>false,orderQrSvg:()=>'<svg viewBox="0 0 41 41"></svg>'};
const layout=loadTs('lib/receipts/shipping-layout.ts'),barcode=loadTs('lib/barcode/code39.ts'),receipt=loadTs('lib/receipts/receipt-model.ts');
const custom=loadTs('lib/receipts/shipping-custom.ts',{'@/lib/receipts/receipt-model':receipt,qrcode:require('qrcode'),'@/lib/barcode/code39':barcode,'@/lib/orders/order-qr':qr,'./shipping-layout':layout});
const templates=loadTs('lib/receipts/shipping-templates.ts',{'./shipping-layout':layout,'./shipping-custom':custom});
const render=loadTs('lib/receipts/shipping-label-markup.ts',{'@/lib/i18n/translations':loadTs('lib/i18n/translations.ts'),'@/lib/orders/order-payment':payment,'@/lib/orders/order-contact':contact,'@/lib/barcode/code39':barcode,'@/lib/orders/order-qr':qr,'@/lib/receipts/receipt-model':receipt,'./shipping-templates':templates,'./shipping-layout':layout,'./shipping-custom':custom});
const orderModel=loadTs('app/(dashboard)/dashboard/orders/[id]/order-detail-model.ts',{'@/lib/orders/order-contact':contact,'@/lib/orders/order-payment':payment});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base={requestId:id(1),branchId:id(2),customerId:null,items:[{productId:id(3),quantity:1,optionIds:[],expectedUnitPrice:50}],paymentMethod:'bank_transfer',amountPaid:50,tenders:[],paymentsConfirmed:true,discount:0,deliveryFee:0,redeemPoints:0,note:'Synthetic payment audit',expectedTotal:50,expectedTaxRate:0,holdId:null,holdVersion:null};
const order={id:id(4),order_number:'SAMPLE-PAYMENT',created_at:'2026-10-04T00:00:00Z',total:50,amount_paid:50,change_amount:0,remaining_balance:0,payment_method:'bank_transfer',payment_status:'paid',status:'new',fulfillment_type:'delivery',guest_name:'SAMPLE RECIPIENT',guest_phone:'Sample phone',guest_address:'SAMPLE ADDRESS',customers:null,order_items:[]};
const store={name:'SAMPLE STORE',phone:'Sample phone',address:'SAMPLE SENDER'};
const translate=loadTs('lib/i18n/translations.ts').translateUiText;
const mobile=loadTs('lib/mobile/shipping-html.ts',{'@/lib/orders/order-qr':qr,'@/lib/receipts/receipt-model':receipt,'@/lib/orders/order-contact':contact,'@/lib/orders/order-payment':payment,'./receipt-html':loadTs('lib/mobile/receipt-html.ts',{'@/lib/receipts/receipt-model':receipt}),'@/lib/receipts/shipping-label-markup':render});
for(const fulfillment of ['in_store','pickup','delivery'])test(`confirmed bank transfer serializes and validates independently of ${fulfillment} fulfillment`,()=>{
 const shipping=fulfillment==='in_store'?{method:fulfillment,recipientName:'',phone:'',address:''}:{method:fulfillment,recipientName:'Sample',phone:'012345',address:fulfillment==='delivery'?'Sample address':'',carrier:fulfillment==='delivery'?'jt':''};
 assert.equal(helpers.validateCheckout({...base,uiVersion:3,currencyQuote:{baseCurrency:'USD',displayCurrency:'USD',enabled:true,usdKhrRate:4000},shipping}),null);
 assert.equal(payment.orderPaymentState({...order,status:fulfillment==='delivery'?'new':'completed',fulfillment_type:fulfillment}),'paid');
});
for(const [name,input,match] of [
 ['unverified transfer',{...base,paymentsConfirmed:false},/Confirm the full/],
 ['partial transfer',{...base,amountPaid:20},/Confirm the full/],
 ['transfer overpayment',{...base,amountPaid:60},/Confirm the full/],
 ['cash deposit',{...base,paymentMethod:'deposit',amountPaid:20},null],
 ['deposit zero',{...base,paymentMethod:'deposit',amountPaid:0},/deposit/],
 ['deposit equals total',{...base,paymentMethod:'deposit'},/deposit/],
 ['COD unpaid',{...base,paymentMethod:'cod',amountPaid:0},null],
 ['COD partial',{...base,paymentMethod:'cod',amountPaid:20},null],
 ['COD full',{...base,paymentMethod:'cod'},null],
 ['COD overpayment',{...base,paymentMethod:'cod',amountPaid:60},/cannot exceed/],
 ['cash change',{...base,paymentMethod:'cash',amountPaid:60},null],
 ['cash underpayment',{...base,paymentMethod:'cash',amountPaid:49.99},/less than/],
 ['verified zero bank total',{...base,expectedTotal:0,amountPaid:0},null],
 ['unverified zero bank total',{...base,expectedTotal:0,amountPaid:0,paymentsConfirmed:false},/Confirm the full/],
 ['cash/bank split',{...base,paymentMethod:'split',tenders:[{method:'cash',amount:20,reference:''},{method:'bank_transfer',amount:30,reference:''}]},null],
 ['unverified split',{...base,paymentMethod:'split',paymentsConfirmed:false,tenders:[{method:'cash',amount:20,reference:''},{method:'bank_transfer',amount:30,reference:''}]},/Confirm all/],
 ['split rounding',{...base,paymentMethod:'split',expectedTotal:.3,amountPaid:.3,tenders:[{method:'cash',amount:.1,reference:''},{method:'bank_transfer',amount:.2,reference:''}]},null],
 ['fractional cent rejected',{...base,amountPaid:50.001},/2 decimal/],
])test(`existing checkout rule: ${name}`,()=>{const issue=helpers.validateCheckout(input);if(match)assert.match(issue,match);else assert.equal(issue,null);});

test('shipping fees apply only to Delivery; UI availability is preserved',()=>{
 for(const method of ['in_store','pickup'])assert.match(helpers.shippingIssue({method,recipientName:'Sample',phone:'012345',address:'Sample'},2),/only apply to Delivery/);
 assert.equal(helpers.shippingIssue({method:'delivery',recipientName:'Sample',phone:'012345',address:'Sample'},2),null);
 assert.equal(customer.paymentHiddenForDelivery('bank_transfer',true),false);
 assert.equal(customer.paymentHiddenForDelivery('cash',true),true);assert.equal(customer.paymentHiddenForDelivery('split',true),true);
 assert.equal(customer.paymentHiddenForWalkIn('deposit',true),true);
});
test('current amounts distinguish paid, partial, unverified, free and refunded without receipt fallback',()=>{
 assert.equal(payment.orderPaymentState({status:'completed'}),'unpaid','fulfillment alone is not payment evidence');
 assert.equal(payment.orderPaymentStatusLabel({...order,payment_status:'unpaid'}),'Paid','detail previously showed Unpaid although net recorded payment covers total');
 assert.equal(payment.orderPaymentState({...order,total:.3,amount_paid:.1+.2,payment_status:'unpaid'}),'paid');
 assert.equal(payment.orderPaymentState({...order,amount_paid:60,change_amount:10,payment_method:'cod',pos_checkout:{method:'cash'}}),'paid');
 assert.equal(payment.orderPaymentMethod({...order,payment_method:'cod',pos_checkout:{method:'cash'}}),'cash');
 assert.equal(payment.orderPaymentMethod({...order,payment_method:'other',pos_checkout:{method:'split'}}),'split');
 assert.equal(payment.orderPaymentState({...order,payment_status:'pending_verification'}),'pending_verification');
 assert.equal(payment.orderPaymentState({...order,amount_paid:20,remaining_balance:30,payment_status:'unpaid'}),'partial');
 assert.equal(payment.orderPaymentState({...order,total:0,amount_paid:0,payment_status:'unpaid'}),'paid');
 assert.equal(payment.orderPaymentState({...order,status:'refunded'}),'refunded');
 const unpaid={...order,payment_status:'unpaid',amount_paid:0,remaining_balance:50,pos_checkout:{method:'bank_transfer',receipt:{amountPaid:50,remaining:0}}};
 assert.equal(payment.orderPaymentState(unpaid),'unpaid','an old receipt must never mark the current financial record paid');
 assert.equal(payment.orderBalanceDue(unpaid),50);
});
test('actual checkbox state reaches the typed request, without a FormData checkbox default',()=>{
 const source=ts.createSourceFile('pos-client.tsx',fs.readFileSync('app/(dashboard)/dashboard/pos/pos-client.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const functions={};function visit(n){if(ts.isFunctionDeclaration(n)&&['receivedAmount','saleInput'].includes(n.name?.text))functions[n.name.text]=n.getText(source);ts.forEachChild(n,visit);}visit(source);
 for(const confirmed of [true,false]){
  const context={method:'bank_transfer',confirmed,values:{total:50,manualDiscount:0},quote:{baseCurrency:'USD',displayCurrency:'USD',enabled:true,usdKhrRate:4000},createCustomer:false,customerId:'',shipping:{method:'in_store'},branch:id(2),lines:[{productId:id(3),quantity:1,optionIds:[],unitPrice:50}],tenders:[],couponCode:'',discountType:'amount',couponValue:{discount:0},discount:'0',delivery:'0',points:'0',note:'',data:{settings:{taxRate:0}},hold:null,paid:''};
  const code=ts.transpileModule(Object.values(functions).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const input=new Function(...Object.keys(context),code+';return saleInput;')(...Object.values(context))(id(1));
  assert.equal(input.paymentMethod,'bank_transfer');assert.equal(input.amountPaid,50);assert.equal(input.paymentsConfirmed,confirmed);
 }
});
for(const size of ['80x50','100x100','100x150'])for(const template of ['en-classic','en-courier','km-classic','km-courier','custom'])test(`label payment semantics: ${template} ${size}`,()=>{
 const language=template.startsWith('km-')?'km':'en';
 const customLayout=layout.defaultShippingLayout(size);customLayout.elements.push({id:'payment-audit',field:'payment',text:'',x:5,y:84,width:90,height:10,fontSize:8,bold:false,align:'left'});
 const settings={shipping_template:template,shipping_label_size:size,...(template==='custom'?{shipping_custom_layout:JSON.stringify(customLayout)}:{})};
 const paid=render.shippingLabelMarkup({order:{...order,payment_method:'cod',pos_checkout:{method:'bank_transfer'}},store,settings}).inner;
 assert.ok(paid.includes(render.shippingPaymentText({...order,payment_method:'cod',pos_checkout:{method:'bank_transfer'}},'USD',false,language)));assert.ok(!paid.includes('COD'));
 const partial={...order,payment_method:'deposit',payment_status:'unpaid',amount_paid:20,remaining_balance:30};
 const output=render.shippingLabelMarkup({order:partial,store,settings}).inner;
 assert.ok(output.includes(translate('Cash deposit',language)));assert.match(output,/\$30\.00/);assert.match(output,/\$50\.00/,'order total is retained separately');
 assert.equal(render.shippingValues(partial,store).payment,'Cash deposit; COD due $30.00');
 // Unpaid COD prints only "COD"; a partly paid COD order keeps the amount still to collect.
 const unpaidCod={...order,payment_method:'cod',payment_status:'unpaid',amount_paid:0,remaining_balance:Number(order.total)};
 assert.equal(render.shippingValues(unpaidCod,store).payment,'COD');
 const codOutput=render.shippingLabelMarkup({order:unpaidCod,store,settings}).inner;assert.ok(!codOutput.includes('COD due'));assert.match(codOutput,/COD/);
 assert.match(render.shippingValues({...unpaidCod,amount_paid:20,remaining_balance:Number(order.total)-20},store).payment,/^COD due \$/);
 const bankPartial={...partial,payment_method:'bank_transfer'};assert.equal(render.shippingValues(bankPartial,store).payment,'Bank transfer; Balance due $30.00');
 const afterRefund=render.shippingValues({...order,status:'refunded'},store);assert.match(afterRefund.payment,/Refunded/);assert.ok(!afterRefund.payment.includes('COD due'));
 assert.match(render.shippingValues({...partial,status:'cancelled'},store).payment,/do not collect/);
});
test('contact edits, pending delivery and refunds preserve the original receipt financial snapshot',()=>{
 const original={orderId:order.id,customerName:'Old sample',shipping:{method:'delivery',recipientName:'Old sample',phone:'Sample',address:'Old sample'},total:50,amountPaid:50,change:0,remaining:0,tenders:[{method:'bank_transfer',amount:50}],lines:[]};
 const before=structuredClone(original),input={...order,total:40,amount_paid:50,remaining_balance:0,status:'refunded',customer_note:'Updated sample',pos_checkout:{method:'bank_transfer',receipt:original}};
 const record=orderModel.recordReceipt(input,'SAMPLE STORE','USD','Main');
 assert.equal(record.total,50);assert.deepEqual(record.tenders,original.tenders);assert.deepEqual(original,before);assert.equal(record.shipping.recipientName,'SAMPLE RECIPIENT');
 assert.equal(input.status,'refunded');assert.equal(input.total,40);
});
test('native labels use the same selected method, paid status and current balance as web labels',()=>{
 const context={store},settings={shipping_label_size:'80x50',shipping_template:'en-classic',shipping_show_barcode:false};
 const paid=mobile.mobileShippingHtml({...order,payment_method:'cod',pos_checkout:{method:'bank_transfer'}},context,settings,'USD').html;
 assert.match(paid,/Bank transfer \(Paid\)/);assert.ok(!paid.includes('COD'));assert.match(paid,/Balance due: \$0\.00/);
 const partial=mobile.mobileShippingHtml({...order,payment_method:'deposit',payment_status:'unpaid',amount_paid:20,remaining_balance:30},context,settings,'USD').html;
 assert.match(partial,/Cash deposit/);assert.match(partial,/Balance due: \$30\.00/);assert.match(partial,/Total: \$50\.00/);
});

const conflicts=[
 ['paid flag with partial COD',{payment_method:'cod',pos_checkout:{method:'cod'},payment_status:'paid',amount_paid:20,remaining_balance:30},'partial',30,false],
 ['paid flag with no money',{payment_method:'cod',pos_checkout:{method:'cod'},payment_status:'paid',amount_paid:0,remaining_balance:50},'unpaid',50,false],
 ['full net and positive recorded balance',{payment_status:'paid',remaining_balance:30},'partial',30,true],
 ['zero recorded balance and short net',{payment_status:'paid',amount_paid:20,remaining_balance:0},'partial',30,true],
 ['unpaid flag full net and positive balance',{payment_status:'unpaid',remaining_balance:10},'partial',10,true],
 ['recorded balance differs from net',{payment_status:'paid',amount_paid:20,remaining_balance:40},'partial',40,true],
 ['change leaves money due',{payment_status:'paid',amount_paid:50,change_amount:10,remaining_balance:10},'partial',10,false],
 ['cash change exactly covers total',{payment_status:'paid',amount_paid:60,change_amount:10,remaining_balance:0},'paid',0,false],
 ['net overpayment with zero balance',{payment_status:'unpaid',amount_paid:60,remaining_balance:0},'paid',0,false],
 ['refunded status with historical balance',{status:'refunded',payment_status:'paid',amount_paid:20,remaining_balance:30},'refunded',0,false],
 ['refunded payment with historical balance',{payment_status:'refunded',amount_paid:20,remaining_balance:30},'refunded',0,false],
 ['pending full payment is not verified',{payment_status:'pending_verification'},'pending_verification',0,false],
 ['cancelled partial payment never collects',{status:'cancelled',payment_status:'paid',amount_paid:20,remaining_balance:30},'partial',0,false],
 ['short net with absent legacy balance',{payment_status:'paid',amount_paid:20,remaining_balance:null},'partial',30,false],
 ['full net with absent legacy balance',{payment_status:'unpaid',remaining_balance:null},'paid',0,false],
 ['all legacy amounts unknown with paid flag',{payment_status:'paid',total:null,amount_paid:null,change_amount:null,remaining_balance:null},'unpaid',null,true],
 ['unknown receipt with positive recorded balance',{payment_status:'paid',amount_paid:null,remaining_balance:30},'unpaid',30,true],
 ['legacy zero balance is not proof of payment',{payment_status:'paid',total:null,amount_paid:null,change_amount:null,remaining_balance:0},'unpaid',0,true],
 ['unknown unpaid legacy amounts',{payment_status:'unpaid',total:null,amount_paid:null,change_amount:null,remaining_balance:null},'unpaid',null,true],
 ['negative recorded balance needs review',{payment_status:'paid',amount_paid:20,remaining_balance:-1},'partial',30,true],
 ['change exceeds gross received',{payment_status:'paid',amount_paid:20,change_amount:30,remaining_balance:30},'unpaid',30,true],
 ['decimal arithmetic settles cents',{payment_status:'unpaid',total:.3,amount_paid:.1+.2,remaining_balance:0},'paid',0,false],
 ['cash paid flag without recorded change',{payment_status:'paid',payment_method:'cod',pos_checkout:{method:'cash'},amount_paid:60,change_amount:null,remaining_balance:null},'unpaid',null,true],
 ['cash paid flag with omitted change',{payment_status:'paid',payment_method:'cod',pos_checkout:{method:'cash'},amount_paid:60,change_amount:undefined,remaining_balance:undefined},'unpaid',null,true],
 ['unknown change retains positive recorded balance',{payment_status:'paid',amount_paid:60,change_amount:null,remaining_balance:30},'unpaid',30,true],
 ['unknown change with explicit zero recorded balance',{payment_status:'paid',amount_paid:60,change_amount:undefined,remaining_balance:0},'unpaid',0,true],
 ['bank transfer cannot assume missing change',{payment_status:'paid',amount_paid:50,change_amount:null,remaining_balance:null},'unpaid',null,true],
 ['legacy numeric strings are explicit amounts',{payment_status:'paid',total:'50.00',amount_paid:'60.00',change_amount:'10.00',remaining_balance:'0.00'},'paid',0,false],
];
for(const [name,value]of [['null',null],['missing',undefined],['NaN',NaN],['infinite',Infinity],['blank',''],['whitespace',' '],['malformed','50oops'],['hex','0x32'],['boolean',true],['array',[]],['object',{}]]){
 for(const field of ['total','amount_paid','change_amount'])conflicts.push([`${field} ${name} cannot establish net settlement`,{payment_status:'paid',[field]:value,remaining_balance:null},field==='total'?'partial':'unpaid',null,true]);
 conflicts.push([`remaining_balance ${name} cannot erase known underpayment`,{payment_status:'paid',amount_paid:20,remaining_balance:value},'partial',30,value!=null]);
}
for(const [name,patch,state,due,review]of conflicts)test(`conflicting payment projection: ${name}`,async()=>{
 const input={...order,...patch};assert.equal(payment.orderPaymentState(input),state);assert.equal(payment.orderBalanceDue(input),due);assert.equal(payment.orderPaymentNeedsReview(input),review);
 const label=payment.orderPaymentStatusLabel(input);assert.equal(label,review&&state!=='pending_verification'?'Needs review':{paid:'Paid',partial:'Partially paid',unpaid:'Unpaid',refunded:'Refunded',pending_verification:'Pending verification'}[state]);
 if(state!=='paid')assert.notEqual(label,'Paid');
 assert.deepEqual(input,{...order,...patch},'projection must not mutate financial records');
 const db={from:table=>{const query=queryDouble(table,{data:table==='orders'?{...input,order_items:[],order_source:'pos'}:[],error:null,count:0},[]);query.is=()=>query;return query;}};
 const workspace=loadTs('app/(dashboard)/dashboard/orders/order-workspace-data.ts',{'@/lib/orders/order-payment':payment,'server-only':{},'@/lib/supabase/branch-server':{createClient:async()=>db},'@/lib/settings/branch-currency':{getBranchCurrency:()=>assert.fail('Currency lookup is unnecessary for detail')}});
 const detail=await workspace.loadOrderDetail(id(1),input.id);assert.equal(detail.paymentState,state);assert.equal(detail.remainingBalance,due);assert.equal(detail.paymentReviewNeeded,review&&state!=='pending_verification');
 for(const size of ['80x50','100x100','100x150'])for(const template of ['en-classic','en-courier','km-classic','km-courier','custom']){
  const design=layout.defaultShippingLayout(size);design.elements.push({id:'conflict-payment',field:'payment',text:'',x:5,y:84,width:90,height:10,fontSize:8,bold:false,align:'left'});
  const settings={shipping_label_size:size,shipping_template:template,shipping_show_barcode:false,shipping_custom_layout:JSON.stringify(design)};
  const web=render.shippingLabelMarkup({order:input,store,settings}).inner;
  const native=mobile.mobileShippingHtml(input,{store},settings,'USD').html;
  for(const [html,language] of [[web,template.startsWith('km-')?'km':'en'],[native,'en']]){
   if(state!=='paid'||review)assert.ok(!html.includes(`(${translate('Paid',language)})`),`${template} ${size}: no false Paid`);
   if(input.status==='cancelled')assert.ok(html.includes(translate('Cancelled — do not collect',language)));
   else if(review)assert.ok(html.includes(translate('Needs review',language)), `${template} ${size}: payment review remains visible`);
   if(due===null)assert.ok(html.includes(translate('Unavailable',language))||html.includes(translate('Balance unavailable',language)));
   else if(template!=='custom'||(!['cancelled','refunded'].includes(input.status)&&!['paid','refunded','pending_verification'].includes(state)))assert.ok(html.includes(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(due)),`${template} ${size}: current balance retained`);
  }
 }
});
