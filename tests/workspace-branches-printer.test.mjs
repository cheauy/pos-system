import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTs} from './helpers/load-ts.cjs';
const model=loadTs('lib/branches/switch-model.ts');
const B='10000000-0000-4000-8000-000000000001',U='20000000-0000-4000-8000-000000000001',A='30000000-0000-4000-8000-000000000001',C='30000000-0000-4000-8000-000000000002';
for(const [input,output]of [['/dashboard/pos','/dashboard/pos'],['/dashboard/orders/'+A,'/dashboard/orders'],['/dashboard/products/edit/'+A,'/dashboard/products'],['/dashboard/settings/printers?branch='+A,'/dashboard/settings/printers'],['//evil.example','/dashboard'],['/dashboard-other','/dashboard'],['/dashboard?branch=all','/dashboard']])test(`switch destination ${input}`,()=>assert.equal(model.branchDestination(input),output));
for(const [state,target,allowed]of [
 [{busy:false,pendingBranchId:null,hasCart:false,hasDialog:false},C,true],
 [{busy:true,pendingBranchId:null,hasCart:false,hasDialog:false},C,false],
 [{busy:false,pendingBranchId:null,hasCart:true,hasDialog:false},C,false],
 [{busy:false,pendingBranchId:null,hasCart:false,hasDialog:true},C,false],
 [{busy:false,pendingBranchId:A,hasCart:true,hasDialog:false},C,false],
 [{busy:false,pendingBranchId:A,hasCart:true,hasDialog:false},A,true],
 [{busy:true,pendingBranchId:A,hasCart:true,hasDialog:false},A,false],
])test(`POS switch guard ${JSON.stringify(state)} to ${target}`,()=>assert.equal(model.posBranchSwitchReason(target,state)===null,allowed));
function action(opts={}) {
 const written=[],checks=[];
 const context={business:{id:opts.businessId||B},userId:U,branchId:opts.current||A,branches:[{id:A,name:'Main'},{id:C,name:'West'}]};
 const api=loadTs('app/(dashboard)/dashboard/branch-actions.ts',{
  'next/headers':{cookies:async()=>({set(...args){written.push(args);}})},
  'next/cache':{revalidatePath(){if(opts.cacheError)throw Error('cache offline');}},
  '@/lib/branches/context':{branchCookie:(b,u)=>`${b}-${u}`,getBranchContext:async()=>context},
  '@/lib/subscriptions/branch-limits':{assertBranchOperation:async(b,l)=>{checks.push({b,l});if(opts.capacityError)throw Error('plan capacity');}},
  '@/lib/branches/switch-model':model,
 });return{api,written,checks};
}
const origin={businessId:B,userId:U,branchId:A};
test('workspace switch verifies identity/capacity and saves scoped HTTP-only cookie',async()=>{
 const h=action();const r=await h.api.switchOperatingBranch(C,origin);assert.equal(r.success,true);assert.equal(r.branchId,C);assert.equal(h.written[0][0],`${B}-${U}`);assert.equal(h.written[0][1],C);assert.equal(h.written[0][2].httpOnly,true);assert.equal(h.written[0][2].path,'/');assert.equal(h.checks.length,1);
});
for(const [name,opts,target,from] of [['business switched',{businessId:C},C,origin],['foreign branch',{},B,origin],['invalid UUID',{},'oops',origin],['missing origin',{},C,undefined],['stale branch',{current:C},A,origin],['capacity rejected',{capacityError:true},C,origin]])test(`reject ${name} without cookie mutation`,async()=>{
 const h=action(opts),r=await h.api.switchOperatingBranch(target,from);assert.equal(r.success,false);assert.equal(h.written.length,0);
});
test('retry to already-selected target is idempotent',async()=>{const h=action({current:C});const r=await h.api.switchOperatingBranch(C,origin);assert.equal(r.success,true);});
test('cookie already saved is not reported as failed on cache error',async()=>{const h=action({cacheError:true});assert.equal((await h.api.switchOperatingBranch(C,origin)).success,true);});
test('workspace status never discloses a replacement business branch',async()=>{const h=action({businessId:C});assert.equal((await h.api.getOperatingBranchStatus(B,U)).success,false);});
test('view defaults now follow operating branch rather than own assigned branch',async()=>{
 const db = {
   auth: {getUser:async()=>({data:{user:{id:U}}})},
   from(table) {
     const q = {
       select(){return q;}, eq(){return q;}, single(){return q;}, order(){return q;},
       then(resolve,reject) {
         const result = table==='business_members'
           ? {data:{default_location_id:A},error:null}
           : {data:[{id:A,name:'Main'},{id:C,name:'West'}],error:null};
         return Promise.resolve(result).then(resolve,reject);
       },
     };
     return q;
   },
 };
 const ctx=loadTs('lib/branches/context.ts',{
   'server-only':{}, react:{cache:fn=>fn},
   'next/headers':{cookies:async()=>({get:()=>({value:C})})},
   '@/lib/supabase/server':{createClient:async()=>db},
   '@/lib/business/get-current-business':{getCurrentBusiness:async()=>({id:B})},
 });
 assert.equal(await ctx.getViewingBranchId(),C);assert.equal(await ctx.getViewingBranchId('all'),'');
});
test('Printer is in the Settings submenu, not the General card list; save actions unchanged',()=>{
 const nav=fs.readFileSync('app/(dashboard)/dashboard/sidebar-client.tsx','utf8');
 assert.match(nav,/name: "Printer", href: "\/dashboard\/settings\/printers"/);
 const general=fs.readFileSync('app/(dashboard)/dashboard/settings/page.tsx','utf8');assert.doesNotMatch(general,/title: "Printer Settings"/);
 const actions=fs.readFileSync('app/(dashboard)/dashboard/settings/receipts/actions.ts','utf8');
 for(const name of ['saveBarcodeLabelSettings','saveShippingLabelSettings'])assert.ok(actions.includes(name));
});
test('switch is globally mounted, performs a fresh navigation and coordinates all tabs',()=>{
 const layout=fs.readFileSync('app/(dashboard)/dashboard/layout.tsx','utf8');assert.match(layout,/WorkspaceBranchProvider businessId/);
 const ui=fs.readFileSync('app/(dashboard)/dashboard/workspace-branch-provider.tsx','utf8');assert.match(ui,/BroadcastChannel/);assert.match(ui,/inert=\{busy \|\| Boolean\(stale\)\}/);assert.match(ui,/window.location.assign\(branchDestination/);assert.match(ui,/guardReason\(id\)/);
 const pos=fs.readFileSync('app/(dashboard)/dashboard/pos/pos-client.tsx','utf8');assert.match(pos,/useBranchSwitchGuard/);assert.doesNotMatch(pos,/await switchOperatingBranch/);
});
