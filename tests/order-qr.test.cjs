const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const qrcode=require('qrcode');
const qr=loadTs('lib/orders/order-qr.ts',{qrcode});
const id='11111111-1111-4111-8111-111111111111';
test('order QR round trips, rejects unrelated data, and preserves every module and quiet zone',()=>{
 const value=qr.orderQrPayload(id);
 assert.equal(qr.parseOrderQr(value),id);
 for(const invalid of ['',id,'https://example.com/'+id,value+'x',value+'\n','TENH:ORDER:2:'+id])assert.equal(qr.parseOrderQr(invalid),null);
 assert.throws(()=>qr.orderQrPayload('<script>'),/Invalid/);
 const {modules}=qrcode.create(value,{errorCorrectionLevel:'M'}),svg=qr.orderQrSvg(id);
 assert.ok(svg.includes(`viewBox="0 0 ${modules.size+8} ${modules.size+8}"`));
 let expected='';for(let y=0;y<modules.size;y++)for(let x=0;x<modules.size;x++)if(modules.get(y,x))expected+=`M${x+4} ${y+4}h1v1h-1z`;
 assert.ok(svg.includes(`d="${expected}"`));
 assert.ok(!svg.includes('http://localhost'));
});
test('QR detail lookup never reads order contents before branch authorization',async()=>{
 for(const allowed of [false,true]){
  const log=[];
  const {loadDetailedOrder}=loadTs('app/(dashboard)/dashboard/orders/[id]/order-detail-data.ts',{
   'server-only':{},'@/lib/branches/order-access':{authorizedOrderBranch:async(b,o)=>{assert.equal(b,'business');assert.equal(o,id);return allowed?'branch':null;}},
   '@/lib/supabase/admin':{supabaseAdmin:{from:table=>queryDouble(table,{data:{id},error:null},log)}},
  });
  assert.equal((await loadDetailedOrder('business',id))?.id??null,allowed?id:null);
  assert.equal(log.length,allowed?1:0);
  if(allowed)assert.ok(log[0].steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business'));
 }
});
