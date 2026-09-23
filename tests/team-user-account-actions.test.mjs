import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}) {
 const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
 const module={exports:{}};
 new Function('require','module','exports',outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id];},module,module.exports);
 return module.exports;
}
const roles=load('../lib/auth/user-role-options.ts');
const model=load('../lib/users/team-model.ts',{'@/lib/auth/user-role-options':roles});
const business='10000000-0000-0000-0000-000000000001',actor='20000000-0000-0000-0000-000000000001',member='30000000-0000-0000-0000-000000000001',branch='40000000-0000-0000-0000-000000000001';
function actions({role='owner',rpc,createUser}={}) {
 const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{role:'staff',user_id:member,default_location_id:branch},error:null};}};
 return load('../app/(dashboard)/dashboard/settings/users/users-workspace-actions.ts',{
  'next/cache':{revalidatePath(){}},
  '@/lib/auth/require-permission':{requirePermission:async()=>({id:business,role})},
  '@/lib/auth/effective-permissions':{businessHasPermission:async()=>true},
  '@/lib/auth/permissions':{permissions:[],editablePermissionRoles:[],rolePermissions:{}},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:actor}},error:null})}})},
  '@/lib/subscriptions/access-safety':{assertSubscriptionCapacityChangeAllowed:async()=>{}},
  '@/lib/supabase/admin':{supabaseAdmin:{from:()=>query,rpc,auth:{admin:{createUser}}}},
  '@/lib/users/team-model':model,
 });
}
test('duplicate email returns an actionable error without changing submitted fields',async()=>{
 const input={requestId:member,name:'Test User',email:'same@example.test',phone:'012345678',role:'staff',branchId:branch,password:'LongPassword123!',sendInvite:false,requirePasswordChange:true};
 const snapshot=structuredClone(input);let released=false;
 const a=actions({createUser:async()=>({data:{user:null},error:{code:'email_exists',message:'A user with this email address has already been registered'}}),rpc:async name=>{
  if(name==='tenh_users_reserve')return {data:{done:false},error:null};
  if(name==='tenh_users_cancel_empty_request'){released=true;return {data:true,error:null};}
  throw Error(name);
 }});
 const result=await a.createTeamUser(business,input);
 assert.equal(result.success,false);assert.match(result.message,/email is already registered/);assert.match(result.message,/details have been kept/);
 assert.equal(Boolean(result.uncertain),false);assert.equal(released,true);assert.deepEqual(input,snapshot);
});
test('Owner deletion uses the atomic account deletion RPC; other roles cannot call it',async()=>{
 let calls=0;
 const rpc=async(name,args)=>{calls++;assert.equal(name,'tenh_users_delete_account');assert.equal(args.p_confirmation,'DELETE');assert.equal(args.p_actor,actor);return {data:{message:'User account deleted.'},error:null};};
 assert.equal((await actions({rpc}).updateTeamUser(business,member,1,'remove',{confirmation:'DELETE'})).success,true);
 assert.equal(calls,1);
 assert.equal((await actions({role:'manager',rpc}).updateTeamUser(business,member,1,'remove',{confirmation:'DELETE'})).success,false);
 assert.equal(calls,1);
});
