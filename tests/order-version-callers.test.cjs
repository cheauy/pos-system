/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');
const id='00000000-0000-4000-8000-000000000001',branch='00000000-0000-4000-8000-000000000002',V='2026-10-01T00:00:00.123456Z';
test('all manage-order actions preserve the exact displayed timestamp and reject null before RPC',async()=>{
 const calls=[];
 const api=loadTs('app/(dashboard)/dashboard/orders/order-workspace-actions.ts',{
  'next/cache':{revalidatePath(){}},'@/lib/audit/create-audit-log':{createAuditLog:async()=>{}},
  '@/lib/auth/require-permission':{requirePermission:async()=>({id})},
  '@/lib/supabase/branch-server':{createClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {error:null};}})},
  './order-workspace-data':{},
 });
 for(const call of [
  version=>api.saveOrderWorkspaceDetails(id,version,{note:'Safe'},id),
  version=>api.changeOrderWorkspaceStatus(id,version,'cancelled','Unavailable',id),
  version=>api.deleteOrderWorkspaceOrder(id,version,'Unavailable',id),
 ]){
  const before=calls.length;assert.equal((await call(V)).success,true);
  assert.equal(calls.at(-1).args.p_expected_updated_at,V);assert.equal(calls.length,before+1);
  assert.equal((await call(null)).success,false);assert.equal(calls.length,before+1);
 }
});
test('online status and payment send the opened timestamp, never the freshly loaded version',async()=>{
 for(const action of ['updateOnlineOrderStatus','updateOnlinePaymentStatus']){
  const calls=[];
  let error=null;
  const api=loadTs('app/(dashboard)/dashboard/online-orders/actions.ts',{
   'next/cache':{revalidatePath(){}},'@/lib/audit/create-audit-log':{createAuditLog:async()=>{}},
   '@/lib/auth/require-permission':{requirePermission:async()=>({id})},
   '@/lib/supabase/branch-server':{createClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{orderId:id,onlineStatus:args.p_status},error};}})},
   '@/lib/branches/incoming-orders':{getIncomingOrders:async()=>({orders:[{id,order_number:'TEST',updated_at:'2026-10-02T00:00:00Z',online_status:'new',payment_status:'unpaid',payment_method:'khqr'}]})},
  });
  assert.equal((await api[action](id,action==='updateOnlineOrderStatus'?'rejected':'paid',V)).success,true);
  assert.equal(calls[0].args.p_expected_updated_at,V);assert.equal(calls.length,1);
  for(const version of [null,undefined,'invalid'])assert.equal((await api[action](id,action==='updateOnlineOrderStatus'?'rejected':'paid',version)).success,false);
  assert.equal(calls.length,1,'invalid version never reaches RPC');
  for(const code of ['PGRST202','42883']){
   error={code,message:'Missing versioned RPC'};const count=calls.length;
   const result=await api[action](id,action==='updateOnlineOrderStatus'?'rejected':'paid',V);
   assert.equal(result.success,false);assert.match(result.message,/20261008043516_online_order_opened_version.sql/);
   assert.equal(calls.length,count+1,'no fallback to an older RPC or migration');
  }
 }
});
test('POS save/delete hold and checkout forward the displayed hold version',async()=>{
 const file='app/(dashboard)/dashboard/pos/pos-workspace-actions.ts',deps={},calls=[];
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 for(const n of ast.statements)if(ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly){
  const exports={};
  for(const e of n.importClause?.namedBindings?.elements||[])if(!e.isTypeOnly)exports[e.propertyName?.text||e.name.text]=()=>{throw new Error('Unexpected dependency '+e.name.text)};
  deps[n.moduleSpecifier.text]=exports;
 }
 Object.assign(deps,{
  '@/lib/branches/context':{assertOperatingBranch:async()=>branch},
  '@/lib/subscriptions/branch-limits':{assertBranchOperation:async()=>{}},
  '@/lib/auth/require-permission':{requirePermission:async()=>({id})},
  '@/lib/auth/effective-permissions':{businessHasPermission:async()=>true},
  '@/lib/supabase/branch-server':{createClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{id,orderId:id},error:null};},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})})},
  'next/cache':{revalidatePath(){}},
  '@/lib/operations/rpc-outcome':{isConfirmedRollback:()=>false},
  './pos-workspace-helpers':{uuid:()=>true,validateCheckout:()=>null},
 });
 const api=loadTs(file,deps),draft={branchId:branch,lines:[{productId:id,quantity:1}]};
 await api.savePosHold(id,id,7,'Held',draft);assert.equal(calls.at(-1).args.p_version,7);
 await api.deletePosHold(id,id,7);assert.equal(calls.at(-1).args.p_version,7);
 await api.completePosSale(id,{requestId:id,branchId:branch,holdId:id,holdVersion:7,paymentMethod:'cash'});
 assert.equal(calls.at(-1).name,'tenh_pos_checkout_registered');assert.equal(calls.at(-1).args.p_input.holdVersion,7);
});
test('web and mobile online callers pass displayed timestamps',()=>{
 const form=fs.readFileSync('components/cancel-order-form.tsx','utf8');
 assert.match(form,/updateOnlineOrderStatus\(orderId, "rejected", updatedAt\)/);
 const web=fs.readFileSync('app/(dashboard)/dashboard/orders/orders-workspace.tsx','utf8');
 assert.equal((web.match(/updateOnlinePaymentStatus\(order.id, "(paid|unpaid)", order.updatedAt\)/g)||[]).length,2);
 const mobile=fs.readFileSync('mobile/src/order-detail.tsx','utf8');
 assert.match(mobile,/api\('payment', scope, \{ id, status: 'paid', updatedAt: data.updatedAt \}\)/);
 assert.match(mobile,/api\(incoming \? 'incoming-status' : 'order', scope, \{ id, updatedAt: data.updatedAt/);
});
