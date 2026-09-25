/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const lock=loadTs('lib/pos/navigation-lock.ts');
const B='11111111-1111-4111-8111-111111111111',U='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333',C='44444444-4444-4444-8444-444444444444';
test('POS lock permits checkout, receipts, Orders and Register only',()=>{
 for(const path of ['/dashboard/pos','/dashboard/pos/receipt/abc','/dashboard/orders?q=123','/dashboard/orders/abc/receipt','/dashboard/register/'])assert.equal(lock.posLockAllows(path),true,path);
 for(const path of ['/dashboard','/dashboard/online-orders','/dashboard/settings','/dashboard/pos-fake','/dashboard/orders-other','/dashboard/products'])assert.equal(lock.posLockAllows(path),false,path);
 assert.notEqual(lock.posLockCookie(B,U),lock.posLockCookie(B,A));
});
function branchContext({role='cashier',assigned=A,saved=C}={}){
 const log=[];const business={id:B,role};
 const db={auth:{getUser:async()=>({data:{user:{id:U}}})},from(table){return queryDouble(table,{data:table==='business_members'?{default_location_id:assigned,role}:[{id:A,name:'A'},{id:C,name:'C'}],error:null},log);}};
 return loadTs('lib/branches/context.ts',{'server-only':{},react:{cache:fn=>fn},'next/headers':{cookies:async()=>({get:()=>({value:saved})})},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/business/get-current-business':{getCurrentBusiness:async()=>business}});
}
test('staff assignment overrides another branch saved in the browser',async()=>{
 const api=branchContext();const context=await api.getBranchContext();assert.equal(context.branchId,A);assert.deepEqual(context.branches.map(b=>b.id),[A]);
 assert.equal(await api.getViewingBranchId('all'),A);await assert.rejects(api.getViewingBranchId(C),/not assigned/);await assert.rejects(api.assertOperatingBranch(C),/changed/);
});
test('staff without an available assignment never fall back to another branch',async()=>{await assert.rejects(branchContext({assigned:null}).getBranchContext(),/assigned branch is unavailable/);});
test('owners retain branch switching and combined reporting',async()=>{const api=branchContext({role:'owner'});assert.equal((await api.getBranchContext()).branchId,C);assert.equal((await api.getBranchContext()).branches.length,2);assert.equal(await api.getViewingBranchId('all'),'');});
test('POS lock action checks workspace and branch before changing a scoped cookie',async()=>{
 const written=[];
 const api=loadTs('app/(dashboard)/dashboard/pos-lock-actions.ts',{'next/headers':{cookies:async()=>({set:(...args)=>written.push(args),get:()=>({value:'1'})})},'@/lib/branches/context':{getBranchContext:async()=>({business:{id:B},userId:U,branchId:A})},'@/lib/auth/effective-permissions':{businessHasPermission:async()=>true},'@/lib/pos/navigation-lock':lock});
 await assert.rejects(api.setPosNavigationLock(B,C,true),/branch or workspace changed/);assert.equal(written.length,0);
 await api.setPosNavigationLock(B,A,true);assert.equal(written[0][0],lock.posLockCookie(B,U));assert.equal(written[0][1],'1');assert.equal(written[0][2].httpOnly,true);
 assert.equal((await api.readPosNavigationLock(B)).locked,true);await api.setPosNavigationLock(B,A,false);assert.equal(written[1][1],'0');
});
