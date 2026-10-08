/* eslint-disable @typescript-eslint/no-require-imports */
// Real route + action code; authentication/database/cache adapters are explicit doubles, not HTTP/Supabase E2E.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {AsyncLocalStorage}=require('node:async_hooks');
const {loadTs}=require('./helpers/load-ts.cjs');
const A='00000000-0000-4000-8000-00000000000a',B='00000000-0000-4000-8000-00000000000b',V='2026-10-01T00:00:00Z';
const stale='This order changed. Refresh before cancelling an item.';
function harness({error=null,session=true,allowed=true,throws=false,cacheThrows=false}={}){
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});if(throws)throw new Error('connection lost');return {error};},
  from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{id:A,order_number:'ORD-1'}})})})})})};
 const actions=loadTs('app/(dashboard)/dashboard/orders/order-workspace-actions.ts',{
  'next/cache':{revalidatePath(){if(cacheThrows)throw new Error('cache failed');}},
  '@/lib/auth/require-permission':{requirePermission:async()=>({id:A})},
  '@/lib/supabase/branch-server':{createClient:async()=>db},
  '@/lib/audit/create-audit-log':{createAuditLog:async()=>{}},'./order-workspace-data':{loadOrderDetail:async()=>({})},
 });
 const file=ts.createSourceFile('route.ts',fs.readFileSync('app/api/mobile/[feature]/route.ts','utf8'),ts.ScriptTarget.Latest,true);
 const deps={};
 // Unused imports fail loudly if this cancellation path ever starts using them.
 for(const node of file.statements){if(!ts.isImportDeclaration(node)||!node.importClause||node.importClause.isTypeOnly)continue;
  const exports={};for(const e of node.importClause.namedBindings?.elements||[])exports[e.propertyName?.text||e.name.text]=()=>{throw new Error('Unexpected route dependency');};
  deps[node.moduleSpecifier.text]=exports;
 }
 Object.assign(deps,{
  '@/lib/mobile/request-context':loadTs('lib/mobile/request-context.ts',{'node:async_hooks':{AsyncLocalStorage}}),
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:session?{id:A}:null},error:null})}})},
  '@/lib/supabase/branch-server':{createClient:async()=>db},
  '@/lib/business/get-current-business':{getCurrentBusinessForSubscription:async()=>({id:A,role:'owner',subscriptionLocked:false})},
  '@/lib/branches/context':{getBranchContext:async()=>({branchId:B,branches:[]})},
  '@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>allowed?['orders.cancel']:[]},
  '@/lib/users/setup-state':{needsTeamPasswordSetup:async()=>false},
  '@/lib/mobile/management':{managementAccess:{}},'@/lib/mobile/account-read':{accountAccess:{}},
  '@/lib/mobile/order-list':{mobileOrderPageSize:()=>15},
  '@/app/(dashboard)/dashboard/pos/pos-workspace-helpers':loadTs('app/(dashboard)/dashboard/pos/pos-workspace-helpers.ts',{'./pos-currency':{}}),
  '@/app/(dashboard)/dashboard/orders/order-workspace-actions':actions,
 });
 const route=loadTs('app/api/mobile/[feature]/route.ts',deps);
 const post=(body={id:A,itemId:B,updatedAt:V,reason:'Unavailable'},headers={})=>route.POST(new Request('https://test.invalid/api/mobile/order-item-cancel',{
  method:'POST',headers:{authorization:'Bearer test','x-business-id':A,'x-branch-id':B,'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body),
 }),{params:Promise.resolve({feature:'order-item-cancel'})});
 return {post,calls,actions};
}
test('mobile item cancel maps only exact version conflicts to 409, with one RPC',async()=>{
 for(const [error,status] of [[null,200],[{code:'PT409',message:stale},409],[{code:'40001',message:stale},409],
  [{code:'40001',message:'could not serialize access due to concurrent update'},503],[{code:'42501',message:'Denied'},403],
  [{code:'28000',message:'Session expired'},401],[{code:'PGRST301',message:'JWT expired'},401],
  [{code:'P0001',message:'Use Return items'},400],[{code:'22023',message:'Invalid input'},400],[{code:'XX000',message:'private internal detail'},503]]){
  const h=harness({error}),r=await h.post();assert.equal(r.status,status,JSON.stringify(error));assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].args.p_expected_updated_at,V);assert.match(r.headers.get('cache-control'),/no-store/);
  if(status===503)assert.doesNotMatch(JSON.stringify(await r.json()),/private internal detail|serialize access/);
 }
});
test('mobile cancellation rejects authentication, permission, selection and validation failures before RPC',async()=>{
 const noToken=harness();assert.equal((await noToken.post(undefined,{authorization:''})).status,401);assert.equal(noToken.calls.length,0);
 for(const options of [{session:false},{allowed:false}]){const h=harness(options);assert.equal((await h.post()).status,options.session===false?401:403);assert.equal(h.calls.length,0);}
 for(const body of ['{bad',[],{id:'bad',itemId:B,updatedAt:V,reason:'r'},{id:A,itemId:B,updatedAt:'bad',reason:'r'},
  {id:A,itemId:B,updatedAt:V,reason:''},{id:A,itemId:B,updatedAt:V,reason:'r'.repeat(501)}]){const h=harness();assert.equal((await h.post(body)).status,400);assert.equal(h.calls.length,0);}
 const selection=harness();assert.equal((await selection.post(undefined,{'x-branch-id':'bad'})).status,400);assert.equal(selection.calls.length,0);
 const missing=harness();assert.equal((await missing.post(undefined,{'x-branch-id':''})).status,400);assert.equal(missing.calls.length,0);
});
test('transport errors stay 503; cache failure after commit does not report cancellation failure',async()=>{
 const h=harness({throws:true});assert.equal((await h.post()).status,503);assert.equal(h.calls.length,1);
 const committed=harness({cacheThrows:true});assert.equal((await committed.post()).status,200);assert.equal(committed.calls.length,1);
});
test('whole-order action forwards the opened version and refuses missing versions without a write',async()=>{
 const h=harness({error:{code:'PT409',message:'This order changed. Refresh before cancelling it.'}});
 assert.equal((await h.actions.cancelOrderWorkspaceOrder(A,V,'r',A)).success,false);
 assert.equal(h.calls[0].args.p_payload.p_expected_updated_at,V);assert.equal(h.calls.length,1);
 const invalid=harness();assert.equal((await invalid.actions.cancelOrderWorkspaceOrder(A,null,'r',A)).success,false);assert.equal(invalid.calls.length,0);
});
test('POS recovery treats PT409 and real serialization rollback as definite, while transport errors stay uncertain',()=>{
 const {isConfirmedRollback}=loadTs('lib/operations/rpc-outcome.ts');
 for(const code of ['PT409','40001','40P01','22023','P0001'])assert.equal(isConfirmedRollback({code}),true,code);
 for(const code of ['503','PGRST202','42501',undefined])assert.equal(isConfirmedRollback({code}),false,String(code));
});
test('installed Supabase client sends a POST RPC once for PT409 and 40001 HTTP 409 responses',async()=>{
 const {createClient}=require('@supabase/supabase-js');
 for(const code of ['PT409','40001']){let requests=0;const client=createClient('https://test.invalid','test-key',{
  auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{requests++;return new Response(JSON.stringify({code,message:stale,details:null,hint:null}),{status:409,headers:{'content-type':'application/json'}});}},
 });const {error}=await client.rpc('tenh_cancel_order_item',{p_expected_updated_at:V});assert.equal(error.code,code);assert.equal(requests,1);}
});
