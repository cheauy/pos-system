const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const {waitForPrintPreview}=loadTs('lib/printing/wait-for-preview.ts');
test('streamed preview waits past iframe load until print content arrives',async()=>{
 const previous=global.MutationObserver;let notify,disconnected=false,content=null;
 global.MutationObserver=class{constructor(callback){notify=callback;}observe(){}disconnect(){disconnected=true;}};
 try{
  const doc={getElementById:()=>content,documentElement:{},location:{pathname:'/dashboard/orders/123/receipt'}};
  let ready=false;const pending=waitForPrintPreview(doc,'#order-receipt-print-area',new AbortController().signal).then(value=>{ready=true;return value;});
  await Promise.resolve();assert.equal(ready,false);
  content={querySelector:()=>null};notify();await Promise.resolve();assert.equal(ready,false);
  content={querySelector:selector=>selector==='#order-receipt-print-area'?{}:null};notify();
  assert.equal(await pending,content);assert.equal(disconnected,true);
 }finally{global.MutationObserver=previous;}
});
test('closing preview cancels waiting and disconnects observer',async()=>{
 const previous=global.MutationObserver;let disconnected=false;
 global.MutationObserver=class{observe(){}disconnect(){disconnected=true;}};
 try{const controller=new AbortController();const pending=waitForPrintPreview({getElementById:()=>null,documentElement:{}},'.receipt',controller.signal);controller.abort();await assert.rejects(pending,/closed/);assert.equal(disconnected,true);}
 finally{global.MutationObserver=previous;}
});
test('real login redirect reports an expired session',async()=>{
 await assert.rejects(waitForPrintPreview({getElementById:()=>null,location:{pathname:'/login'}},'.receipt',new AbortController().signal),/session has expired/);
});
