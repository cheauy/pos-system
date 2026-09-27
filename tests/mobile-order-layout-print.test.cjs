const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const {loadMobileOrderPage,mobileOrderPageSize,incomingOrderStatus}=loadTs('lib/mobile/order-list.ts');
const {outputOrderDocument}=loadTs('mobile/src/order-document.ts');

test('8-card pages and 10/15-row lists have no skipped or duplicate orders under SQL minimum 10',async()=>{
 const rows=Array.from({length:83},(_,id)=>({id}));
 const load=async filters=>{const size=Math.max(10,Math.min(50,filters.limit));const pages=Math.ceil(rows.length/size),page=Math.min(filters.page,pages);return {rows:rows.slice((page-1)*size,page*size),page,pages,total:rows.length};};
 for(const size of [8,10,15]){
  const found=[];
  for(let page=1;page<=Math.ceil(rows.length/size);page++){const result=await loadMobileOrderPage(load,{},page,size);assert.ok(result.rows.length<=size);found.push(...result.rows);}
  assert.deepEqual(found,rows);
  assert.deepEqual((await loadMobileOrderPage(load,{},100,size)).rows,[]);
 }
 assert.equal(mobileOrderPageSize('999'),8);
 assert.equal(mobileOrderPageSize('15'),15);
 assert.equal(incomingOrderStatus({online_status:'completed',payment_status:'refunded'}),'refunded');
});

test('receipt sharing and printing use generated PDF; oversized labels never print',async()=>{
 const calls=[];
 const printer={printToFileAsync:async options=>{calls.push(['pdf',options]);return {uri:'file:///receipt.pdf',numberOfPages:1};},printAsync:async options=>calls.push(['print',options])};
 const sharing={isAvailableAsync:async()=>true,shareAsync:async(...args)=>calls.push(['share',...args])};
 await outputOrderDocument({html:'<html>receipt</html>',width:226},true,false,printer,sharing);
 assert.equal(calls[1][0],'share');assert.equal(calls[1][1],'file:///receipt.pdf');assert.equal(calls[1][2].mimeType,'application/pdf');
 calls.length=0;
 await outputOrderDocument({html:'<html>label</html>',width:283,height:425},false,true,printer);
 assert.equal(calls[0][1].height,425);assert.deepEqual(calls[1],['print',{uri:'file:///receipt.pdf'}]);
 printer.printToFileAsync=async()=>({uri:'file:///oversized.pdf',numberOfPages:2});
 printer.printAsync=async()=>assert.fail('oversized label must not print');
 await assert.rejects(()=>outputOrderDocument({html:'label'},false,true,printer),/one page/);
 await assert.rejects(()=>outputOrderDocument({html:''},false,false,printer),/empty/);
 await assert.rejects(()=>outputOrderDocument({html:'receipt'},true,false,printer,{isAvailableAsync:async()=>false}),/unavailable/);
});
