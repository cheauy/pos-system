/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const sharp=require('sharp');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const fields=loadTs('lib/support/reports.ts');
const B='11111111-1111-4111-8111-111111111111',U='22222222-2222-4222-8222-222222222222',ID='33333333-3333-4333-8333-333333333333';
async function form(){const data=new FormData();data.set('title','Payment not found');data.set('reason','Billing or Payment');data.set('image',new File([await sharp({create:{width:10,height:10,channels:3,background:'#ffffff'}}).png().toBuffer()],'screen.png',{type:'image/png'}));return data;}
test('title, supported reason and image are required; details are optional',async()=>{
 const data=await form();assert.ok(!fields.readSupportFields(data).error);
 for(const name of ['title','reason','image']){const missing=await form();missing.delete(name);assert.ok(fields.readSupportFields(missing).error);}
 data.set('reason','Unknown reason');assert.ok(fields.readSupportFields(data).error);
});
test('images are decoded before upload, private and cleaned up after a failed save',async()=>{
 const events=[];let dbFailure=false;
 const storage={upload:async(path,bytes,options)=>{events.push({upload:path,bytes,options});return {error:null};},remove:async(paths)=>{events.push({remove:paths});return {error:null};}};
 const api=loadTs('lib/support/save-report.ts',{'server-only':{},'node:crypto':{randomUUID:()=>ID},sharp:{default:sharp},'./reports':fields,'@/lib/supabase/admin':{supabaseAdmin:{storage:{from:bucket=>{assert.equal(bucket,'support-report-images');return storage;}},from:table=>{const q=queryDouble(table,{data:null,error:null},[]);q.insert=async row=>{events.push({row});return {error:dbFailure?{code:'23514'}:null};};return q;}}}});
 const data=await form();assert.equal((await api.saveSupportReport(data,U,B)).ok,true);
 assert.equal(events[0].upload,`${B}/${U}/${ID}.webp`);assert.equal(events[0].options.contentType,'image/webp');assert.equal((await sharp(events[0].bytes).metadata()).format,'webp');assert.equal(events[1].row.created_by,U);assert.equal(events[1].row.reason,'Billing or Payment');assert.equal(events[1].row.page_path,'');
 dbFailure=true;assert.equal((await api.saveSupportReport(await form(),U,B)).ok,false);assert.ok(events.some(e=>e.remove));
 const before=events.length;data.set('image',new File(['not an image'],'fake.png',{type:'image/png'}));assert.equal((await api.saveSupportReport(data,U,B)).ok,false);assert.equal(events.length,before);
});
test('attachment route limits customer access to their own workspace reports',async()=>{
 for(const [admin,own,expected] of [[false,true,200],[false,false,404],[true,false,200]]){
  let downloads=0;const log=[];
  const db={auth:{getUser:async()=>({data:{user:{id:U}},error:null})},from:table=>queryDouble(table,{data:{role:admin?'super_admin':'cashier',is_active:true},error:null},log)};
  const privileged={from:table=>queryDouble(table,call=>({data:table==='business_members'?{id:ID}:(!own&&call.steps.some(s=>s[0]==='eq'&&s[1]==='created_by'))?null:{image_path:'private.webp',business_id:B,created_by:U},error:null}),log),storage:{from:()=>({download:async()=>{downloads++;return {data:new Blob(['image']),error:null};}})}};
  const api=loadTs('app/api/support/reports/[id]/image/route.ts',{'@/lib/supabase/server':{createClient:async()=>db},'@/lib/supabase/admin':{supabaseAdmin:privileged},'@/lib/business/get-current-business':{getCurrentBusiness:async()=>({id:B})},'@/lib/support/reports':fields});
  const response=await api.GET(new Request('https://example.com'),{params:Promise.resolve({id:ID})});assert.equal(response.status,expected);assert.equal(downloads,expected===200?1:0);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 }
});
