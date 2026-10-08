const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs'),permissions=loadTs('lib/auth/permissions.ts');
const B='00000000-0000-4000-8000-000000000001',A='00000000-0000-4000-8000-000000000002',OTHER='00000000-0000-4000-8000-000000000003';
function setup(active=A){
 const writes=[],business={id:B,role:'owner'};
 const actions=loadTs('app/(dashboard)/dashboard/settings/users/users-workspace-actions.ts',{
 'next/cache':{revalidatePath(){}},
 '@/lib/auth/require-permission':{requirePermission:async()=>business},
 '@/lib/auth/effective-permissions':{businessHasPermission:async()=>true,getPermissionMatrix:async()=>({})},
 '@/lib/auth/permissions':permissions,
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:B}},error:null})}})},
 '@/lib/supabase/branch-server':{createClient:async()=>({from(table){const q={upsert:async(rows)=>{writes.push({table,rows});return {error:null};},delete(){writes.push({table,deleted:true,filters:[]});return q;},eq(k,v){writes.at(-1).filters.push([k,v]);return q;},then(ok){return Promise.resolve({error:null}).then(ok);}};return q;}})},
 '@/lib/branches/context':{getBranchContext:async()=>({branchId:active}),assertOperatingBranch:async(expected)=>{if(expected!==active)throw Error('The operating branch changed. Reload this screen before continuing.');return {branchId:active};}},
 '@/lib/subscriptions/access-safety':{},'@/lib/supabase/admin':{supabaseAdmin:{from:()=>({insert:async()=>({error:null})})}},
 '@/lib/users/team-model':{isId:()=>true}
 });return {actions,writes};
}
for(const operation of ['save','reset'])for(const expected of [A,OTHER,null]){
 test(`role ${operation} refuses stale/missing branch before writes (${expected})`,async()=>{
 const {actions,writes}=setup(OTHER);
 const result=operation==='save'?await actions.saveRolePermissions(B,'staff',[],expected):await actions.resetRolePermissions(B,'staff',expected);
 if(expected===OTHER){assert.equal(result.success,true);assert.equal(writes.length,1);if(operation==='save')assert.ok(writes[0].rows.every(r=>r.location_id===OTHER));else assert.ok(writes[0].filters.some(([k,v])=>k==='location_id'&&v===OTHER));}
 else{assert.equal(result.success,false);assert.match(result.message,/branch changed|Reload/i);assert.deepEqual(writes,[]);}
 });
}

