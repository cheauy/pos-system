const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const {checkoutPayment}=loadTs('mobile/src/checkout-payment.ts');
test('split payments preserve exact totals for all supported pairs and reject duplicates',()=>{
 for(const first of ['cash','bank_transfer','other'])for(const second of ['cash','bank_transfer','other']){
  if(first===second){assert.throws(()=>checkoutPayment('split',10.01,'3.33',[first,second]),/different/);continue;}
  const value=checkoutPayment('split',10.01,'3.33',[first,second]);
  assert.deepEqual(value.tenders.map(t=>[t.method,t.amount]),[[first,3.33],[second,6.68]]);
  assert.equal(value.amountPaid,10.01);assert.equal(value.paymentsConfirmed,true);
 }
 assert.throws(()=>checkoutPayment('split',10,'3',['cash','cod']),/different/);
 assert.throws(()=>checkoutPayment('split',10,'10',['cash','other']),/less than/);
});
test('purchase and transfer product pickers retain their own permissions and branch currency',async()=>{
 const calls=[];
 const management=loadTs('lib/mobile/management.ts',{'node:crypto':require('node:crypto'),'@/lib/images/compress-photo':{},'@/lib/public-photo-cache':{},'next/cache':{}});
 assert.equal(management.managementAccess['purchase-products'],'purchases.create');
 assert.equal(management.managementAccess['transfer-products'],'transfers.manage');
 assert.equal(management.managementAccess['draft-options'],'purchases.create');
 const db={from:table=>{const q=queryDouble(table,{data:table==='branch_pos_settings'?{currency:'KHR'}:[{id:'p',image_url:'old',variant_image_url:'new'}],count:1,error:null},calls);q.neq=(...args)=>{calls.at(-1).steps.push(['neq',...args]);return q;};return q;}};
 const result=await management.managementRead(db,'purchase-products','business','branch',new URL('https://local/purchase-products?search=shirt&page=2'));
 assert.equal(result.currency,'KHR');assert.equal(result.rows[0].image_url,'new');
 assert.ok(calls[0].steps.some(s=>s[0]==='eq'&&s[1]==='business_id'&&s[2]==='business'));
 assert.ok(calls[0].steps.some(s=>s[0]==='neq'&&s[1]==='product_type'&&s[2]==='bundle'));
 assert.ok(calls[0].steps.some(s=>s[0]==='range'&&s[1]===25&&s[2]===49));
 assert.ok(calls[1].steps.some(s=>s[0]==='eq'&&s[1]==='location_id'&&s[2]==='branch'));
});
