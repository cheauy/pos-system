/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const B='11111111-1111-4111-8111-111111111111';
function support({allowed=true,dbError=false}={}){
 const log=[];
 const auth={requireSuperAdmin:async()=>{if(!allowed)throw Error('Forbidden');return {id:B};}};
 const admin={from(table){const q=queryDouble(table,{data:{id:B},error:dbError?{message:'failure'}:null},log);q.insert=value=>{log.push({insert:value});return Promise.resolve({error:dbError?{message:'failure'}:null});};return q;}};
 return {log,api:loadTs('app/(super-admin)/super-admin/support/actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/auth/require-super-admin':auth,'@/lib/supabase/admin':{supabaseAdmin:admin}})};
}
function form(values){const data=new FormData();for(const[k,v]of Object.entries(values))data.set(k,v);return data;}
test('support checks access before reading or writing data',async()=>{
 const {api,log}=support({allowed:false});await assert.rejects(api.createBugReport({},form({})),/Forbidden/);await assert.rejects(api.updateBugStatus(B,'resolved'),/Forbidden/);assert.equal(log.length,0);
});
test('support rejects invalid reports and statuses without database writes',async()=>{
 const {api,log}=support();assert.equal((await api.createBugReport({},form({title:'x',description:'short'}))).ok,false);assert.equal((await api.updateBugStatus(B,'deleted')).ok,false);assert.equal(log.length,0);
});
test('report saves attributed text and strips query secrets from page paths',async()=>{
 const {api,log}=support();const result=await api.createBugReport({},form({title:'Order filter issue',description:'Steps: open orders and change the filter.',pagePath:'/dashboard/orders?token=secret',priority:'normal'}));assert.equal(result.ok,true);assert.equal(log.find(x=>x.insert).insert.page_path,'/dashboard/orders');assert.equal(log.find(x=>x.insert).insert.created_by,B);
});
test('database failures do not report a successful save',async()=>{
 const {api}=support({dbError:true});assert.equal((await api.createBugReport({},form({title:'Filter issue',description:'The filter does not apply correctly.'}))).ok,false);assert.equal((await api.updateBugStatus(B,'resolved')).ok,false);
});
test('removed business creation cannot perform writes',async()=>{
 let checked=false;
 const api=loadTs('app/(super-admin)/super-admin/businesses/new/actions.ts',{'@/lib/auth/require-super-admin':{requireSuperAdmin:async()=>{checked=true;}}});
 assert.equal((await api.createCustomerBusiness({},form({}))).success,false);assert.equal(checked,true);
});
test('website health action rejects unauthorized users before contacting services',async()=>{
 let called=false;
 const api=loadTs('app/(super-admin)/super-admin/health/actions.ts',{'@/lib/auth/require-super-admin':{requireSuperAdmin:async()=>{throw Error('Forbidden');}},'@/lib/super-admin/health':{collectHealth:async()=>{called=true;return [];}}});
 await assert.rejects(api.runWebsiteHealth(),/Forbidden/);assert.equal(called,false);
});
test('health checks are read-only, bounded and do not expose credentials',async()=>{
 const oldFetch=global.fetch,original={...process.env};const calls=[];
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service-key',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-key',RESEND_API_KEY:'private-email-key',ORDER_EMAIL_FROM:'Store <orders@example.com>',PAYWAY_API_KEY:'private-payway-key',PAYWAY_MERCHANT_ID:'merchant'});
 global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>String(url).includes('/domains')?{data:[{name:'example.com',status:'verified'}]}:String(url).includes('/settings')?{external:{google:true,facebook:true}}:[]};};
 const api=loadTs('lib/super-admin/health.ts',{'server-only':{},'node:crypto':require('node:crypto'),'@/lib/payway/server':{getPaywayConfig:()=>({environment:'sandbox',purchaseUrl:'https://checkout-sandbox.payway.com.kh/purchase',apiKey:'private-payway-key'}),verifyPaywayCallbackSignature:(p,s)=>p.tran_id==='TENH-HEALTH-SELF-TEST'&&Boolean(s)}});
 try{const results=await api.collectHealth();assert.equal(results.length,10);assert.ok(calls.every(c=>!c.options.method&&c.options.signal&&c.options.redirect==='manual'));assert.equal(results.find(r=>r.name==='ABA PayWay').status,'warning');assert.equal(results.find(r=>r.name==='Webhooks').status,'warning');assert.ok(!JSON.stringify(results).includes('private-'));}finally{global.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);}
});
