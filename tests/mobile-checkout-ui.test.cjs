const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.createSourceFile('pos.tsx', fs.readFileSync('mobile/src/pos.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pos = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Pos');
test('review opens immediately while only the quote is checked', async () => {
  const events=[];
  let finish;
  const quote={total:{total:12}};
  const review=method('reviewCheckout',{
    checkoutRequest:()=>({items:['p']}),scope:{},paymentMethod:'cash',current:{current:true},
    setReviewing:value=>events.push(['review',value]),setQuote:value=>events.push(['quote',value]),setReceived:value=>events.push(['received',value]),
    api:(path)=>{events.push(['request',path]);return new Promise(resolve=>{finish=resolve;});},
  });
  const waiting=review();
  assert.deepEqual(events,[['review',true],['request','quote']]);
  finish(quote);await waiting;
  assert.deepEqual(events.slice(2),[['quote',quote],['received','12.00'],['review',false]]);
});
test('failed quote returns to checkout without a payable total', async () => {
  const events=[];
  const review=method('reviewCheckout',{
    checkoutRequest:()=>({}),scope:{},current:{current:true},setReviewing:value=>events.push(value),
    api:async()=>{throw Error('Unavailable');},setQuote:()=>assert.fail('No quote on failure'),
  });
  await assert.rejects(review(),/Unavailable/);
  assert.deepEqual(events,[true,false]);
});
function method(name, context) {
  const node = pos.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const js = ts.transpileModule(node.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(context), js + `;return ${name}`)(...Object.values(context));
}
test('checkout requires payment and complete customer details except walk-in', () => {
  const context = { shipping: { method: 'in_store' }, paymentMethod: '', customerId: '', deliveryFee: '0', discount: '0', redeemPoints: '0', Crypto: { randomUUID: () => 'request' }, items: [], discountType: 'amount', couponCode: '', hold: null, holdLabel: '', catalog: {settings:{currency:'USD'}} };
  assert.throws(() => method('checkoutRequest', context)(true), /payment method/);
  context.paymentMethod = 'cash';
  assert.equal(method('checkoutRequest', context)(true).customerId, null);
  context.shipping = { method:'pickup', recipientName:'Sam', phone:'123', address:'Street' };
  assert.throws(() => method('checkoutRequest', context)(true), /Select a customer/);
  context.customerId = 'customer';
  assert.equal(method('checkoutRequest', context)(true).customerId, 'customer');
  context.shipping.address = ' ';
  assert.throws(() => method('checkoutRequest', context)(true), /address/);
});
test('increasing an item cannot exceed branch stock across cart lines', () => {
  let rows = [{productId:'p',quantity:2,optionIds:[]}], warning = '';
  const context = {items:rows,theme:{alert:(_,message)=>warning=message},setItems:fn=>rows=fn(rows),setProduct(){},setVariants(){},setQuote(){}};
  method('add',context)({id:'p',available:2},[]);
  assert.equal(rows[0].quantity,2); assert.match(warning,/No more stock/);
  method('add',context)({id:'p',available:3},[]);
  assert.equal(rows[0].quantity,3);
});
test('completed sale clears pending state and shows receipt without automatic printing', async () => {
  const removed = []; let displayed;
  const context = {storage:{removeItem:async key=>removed.push(key)},draftKey:'draft',pendingKey:'pending',current:{current:true},clearCache(){},setReceipt:value=>displayed=value};
  for(const name of ['setPending','setQuote','setItems','setCartOpen','setDefiniteFailure','setCustomerId','setPaymentMethod','setShipping','setDeliveryFee','setDiscount','setDiscountType','setCouponCode','setRedeemPoints','setHold','setHoldLabel','setCatalogRevision']) context[name]=()=>{};
  const receipt={orderId:'order',total:12};
  await method('finish',context)(receipt);
  assert.deepEqual(removed,['draft','pending']); assert.equal(displayed,receipt);
});
