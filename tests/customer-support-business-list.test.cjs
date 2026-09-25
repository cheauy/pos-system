/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const {readSupportFields}=loadTs('lib/support/reports.ts');
const BUSINESS='11111111-1111-4111-8111-111111111111',USER='22222222-2222-4222-8222-222222222222';
function harness({user=true,member=true,failure=false,refreshFailure=false}={}){
 const log=[];
 const client={auth:{getUser:async()=>({data:{user:user?{id:USER}:null},error:null})}};
 const admin={from(table){if(table==='business_members')return queryDouble(table,{data:member?{id:'membership'}:null,error:null},log);return {insert:async row=>{log.push({row});return {error:failure?{message:'DB unavailable'}:null};}};}};
 const api=loadTs('app/(dashboard)/dashboard/settings/support/actions.ts',{'next/cache':{revalidatePath(){if(refreshFailure)throw Error('refresh failed');}},'@/lib/business/get-current-business':{getCurrentBusiness:async()=>({id:BUSINESS})},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{supabaseAdmin:admin},'@/lib/support/save-report':{saveSupportReport:async(form,userId,businessId)=>{const fields=readSupportFields(form);if(fields.error)return {ok:false,message:fields.error};const {error}=await admin.from('platform_support_reports').insert({title:fields.title,description:fields.description,reason:fields.reason,business_id:businessId,created_by:userId,status:'open',page_path:''});return {ok:!error,message:error?'Failed':'Saved'};}}});
 return {api,log};
}
function form(extra={}){const f=new FormData();for(const[k,v]of Object.entries({title:'Order filter issue',description:'Open orders and select a filter; the list does not update.',priority:'normal',reason:'Bug or Technical Issue',image:new File(['stub'],'image.png',{type:'image/png'}),...extra}))f.set(k,v);return f;}
test('customer report ownership and status come from the server',async()=>{
 const {api,log}=harness();assert.equal((await api.submitCustomerBugReport(form({businessId:'another-business',created_by:'someone-else',status:'resolved',pagePath:'/dashboard/orders?token=secret'}))).ok,true);
 const saved=log.find(v=>v.row).row;assert.equal(saved.business_id,BUSINESS);assert.equal(saved.created_by,USER);assert.equal(saved.status,'open');assert.equal(saved.page_path,'');
 const membership=log.find(v=>v.table==='business_members');assert.ok(membership.steps.some(([op,key,value])=>op==='eq'&&key==='is_active'&&value===true));
});
test('signed-out and inactive members cannot report through privileged storage',async()=>{
 for(const options of [{user:false},{member:false}]){const {api,log}=harness(options);assert.equal((await api.submitCustomerBugReport(form())).ok,false);assert.ok(!log.some(v=>v.row));}
});
test('invalid fields and failed saves return errors without false success',async()=>{
 for(const extra of [{title:'x'},{reason:'unknown'},{priority:'critical'},{image:''}]){const {api,log}=harness();assert.equal((await api.submitCustomerBugReport(form(extra))).ok,false);assert.ok(!log.some(v=>v.row));}
 assert.equal((await harness({failure:true}).api.submitCustomerBugReport(form())).ok,false);
});
test('customer reads are restricted to their account and current business',async()=>{
 const log=[];
 const Page=loadTs('app/(dashboard)/dashboard/settings/support/page.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),'next/navigation':{redirect(){throw Error('redirect');}},'@/lib/business/get-current-business':{getCurrentBusiness:async()=>({id:BUSINESS})},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:USER}},error:null})}})},'@/lib/supabase/admin':{supabaseAdmin:{from:table=>queryDouble(table,{data:[],error:null},log)}},'./support-client':{default:()=>null}}).default;
 await Page();assert.ok(log[0].steps.some(([op,key,value])=>op==='eq'&&key==='business_id'&&value===BUSINESS));assert.ok(log[0].steps.some(([op,key,value])=>op==='eq'&&key==='created_by'&&value===USER));
});
const {businessListStatus,selectBusinessPage}=loadTs('lib/super-admin/business-list.ts');
const now=Date.parse('2026-09-24T00:00:00Z');
const base={id:'a',name:'Melody',slug:'melody',business_code:'B001',is_active:true,disabled_reason:null,subscription_expires_at:'2026-10-24T00:00:00Z',created_at:'2026-09-01'};
test('business status filters use expiry and suspension consistently',()=>{
 assert.equal(businessListStatus(base,now),'active');assert.equal(businessListStatus({...base,subscription_expires_at:'2026-09-23'},now),'expired');assert.equal(businessListStatus({...base,disabled_reason:'manually_suspended'},now),'suspended');assert.equal(businessListStatus({...base,is_active:false},now),'inactive');
 const rows=[base,{...base,id:'b',subscription_expires_at:'2026-09-23'}];assert.deepEqual(selectBusinessPage(rows,{search:'',status:'expired',sort:'newest',page:1},now).rows.map(b=>b.id),['b']);
});
test('business search, pagination and sorting preserve totals and do not mutate input',()=>{
 const rows=Array.from({length:45},(_,i)=>({...base,id:String(i).padStart(2,'0'),name:`Business ${i}`,business_code:`CODE-${i}`}));
 const original=rows.map(r=>r.id);let page=selectBusinessPage(rows,{search:'',status:'all',sort:'name',page:2},now);assert.equal(page.total,45);assert.equal(page.rows.length,20);assert.equal(page.pages,3);assert.deepEqual(rows.map(r=>r.id),original);
 page=selectBusinessPage(rows,{search:'CODE-44',status:'all',sort:'newest',page:999},now);assert.equal(page.page,1);assert.equal(page.rows[0].id,'44');
 assert.equal(selectBusinessPage(rows,{search:'unknown',status:'all',sort:'newest',page:-1},now).page,1);
});
