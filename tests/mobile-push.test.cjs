const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
test('push dispatcher rejects unauthorized callers, handles provider failures without resending, and checks receipts',async()=>{
 const before={secret:process.env.CRON_SECRET,enabled:process.env.MOBILE_PUSH_ENABLED,fetch:global.fetch};
 process.env.CRON_SECRET='test-secret';process.env.MOBILE_PUSH_ENABLED='true';
 let claims=0,updates=0,fetches=0,providerFails=false,updateFails=false;
 const admin={rpc:async()=>{claims++;return {data:claims===1?[{device_id:'d',notification_id:'n',token:'ExpoPushToken[test]'}]:[],error:null};},from:()=>{
  const q={};for(const key of ['select','is','not','lt','gt','limit','eq'])q[key]=()=>q;
  q.update=()=>{updates++;return q;};q.delete=()=>q;
  q.then=(ok,bad)=>Promise.resolve({data:[],error:updateFails?{message:'failed'}:null}).then(ok,bad);return q;
 }};
 const {GET}=loadTs('app/api/internal/mobile-push/route.ts',{'node:crypto':require('node:crypto'),'@/lib/supabase/admin':{supabaseAdmin:admin}});
 global.fetch=async()=>{fetches++;return providerFails?new Response('',{status:503}):Response.json({data:[{status:'ok',id:'ticket'}]});};
 const request=token=>new Request('https://local/api/internal/mobile-push',{headers:{authorization:token}});
 try{
  assert.equal((await GET(request('Bearer bad'))).status,401);
  assert.equal((await GET(request('Bearer ééééééééééé'))).status,401);assert.equal(claims,0);
  process.env.MOBILE_PUSH_ENABLED='false';assert.equal((await GET(request('Bearer test-secret'))).status,200);assert.equal(claims,0);
  process.env.MOBILE_PUSH_ENABLED='true';assert.equal((await GET(request('Bearer test-secret'))).status,200);assert.equal(updates,1);assert.equal(fetches,1);
  assert.equal((await GET(request('Bearer test-secret'))).status,200);assert.equal(fetches,1);
  claims=0;providerFails=true;assert.equal((await GET(request('Bearer test-secret'))).status,503);
  assert.equal((await GET(request('Bearer test-secret'))).status,200);assert.equal(fetches,2,'claimed alerts not sent twice');
  updateFails=true;assert.equal((await GET(request('Bearer test-secret'))).status,503);
 }finally{global.fetch=before.fetch;for(const [key,value] of [['CRON_SECRET',before.secret],['MOBILE_PUSH_ENABLED',before.enabled]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
