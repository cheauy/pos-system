const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const {checkoutPayment}=loadTs('mobile/src/checkout-payment.ts');
test('Online Store distinguishes initial setup from database errors and preserves existing settings',async()=>{
 const management=loadTs('lib/mobile/management.ts',{'./product-page':{},'node:crypto':require('node:crypto'),'@/lib/images/compress-photo':{},'@/lib/public-photo-cache':{},'next/cache':{}});
 const calls=[];let result={data:null,error:null};
 const db={from:table=>queryDouble(table,()=>result,calls)};
 assert.deepEqual(await management.managementRead(db,'storefront','business','branch',new URL('https://local')), {configured:false});
 result={data:{display_name:'Shop',is_published:false,updated_at:'version'},error:null};
 assert.deepEqual(await management.managementRead(db,'storefront','business','branch',new URL('https://local')), {...result.data,configured:true});
 result={data:null,error:{message:'Access unavailable'}};
 await assert.rejects(()=>management.managementRead(db,'storefront','business','branch',new URL('https://local')),/Access unavailable/);
 assert.ok(calls.every(call=>call.steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business')));
 assert.equal(management.managementAccess['category-products'],'categories.manage');
});
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
 const management=loadTs('lib/mobile/management.ts',{'./product-page':loadTs('lib/mobile/product-page.ts'),'node:crypto':require('node:crypto'),'@/lib/images/compress-photo':{},'@/lib/public-photo-cache':{},'next/cache':{}});
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
test('bundle create and edit preserve exact components and saved success despite cache refresh failure',async()=>{
 const management=loadTs('lib/mobile/management.ts',{'./product-page':{},'node:crypto':require('node:crypto'),'@/lib/images/compress-photo':{},'@/lib/public-photo-cache':{},'next/cache':{revalidatePath(){throw Error('test cache unavailable');}}});
 const requestId='10000000-0000-4000-8000-000000000001';
 const calls=[],db={rpc:async(name,args)=>{calls.push({name,args});return {data:{success:true,id:requestId},error:null};}};
 for(const operation of ['bundle-create','bundle-edit']){
  const input={id:requestId,name:'Set',sku:'SET-1',price:'20',expected:'2026-09-27T01:00:00Z',items:[{productId:'small',quantity:1,optionIds:[]},{productId:'large',quantity:2,optionIds:['option']}],imageUrl:'https://untrusted.invalid/image.jpg'};
  const form=new FormData();form.set('requestId',requestId);form.set('input',JSON.stringify(input));
  const result=await management.managementWrite(db,operation,'business','branch','user',form);
  assert.equal(result.success,true);assert.equal(result.uncertain,false);
  const {args}=calls.at(-1);assert.equal(args.p_branch_id,'branch');assert.equal(args.p_operation,operation);assert.equal(args.p_request_id,requestId);
  assert.deepEqual(args.p_input.items,input.items);assert.equal(args.p_input.expected,input.expected);assert.equal(args.p_input.imageUrl,undefined);
 }
});
