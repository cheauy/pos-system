const test=require('node:test');const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const settings=loadTs('lib/notifications/settings.ts');
function harness(){
 let owner=true,branch='branch',fail=false;const writes=[];
 const api=loadTs('app/(dashboard)/dashboard/notifications/actions.ts',{
  'next/cache':{revalidatePath(){}},'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',role:owner?'owner':'cashier'})},
  '@/lib/business/get-current-business':{getCurrentBusiness:async()=>({id:'business'})},
  '@/lib/branches/context':{assertOperatingBranch:async id=>{if(id!==branch)throw Error('Branch changed');}},
  '@/lib/notifications/settings':settings,
  '@/lib/supabase/branch-server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'trusted-user'}}})},from:table=>({upsert:async(rows,options)=>{writes.push({table,rows,options});return {error:fail?{}:null};}}),rpc:async()=>({error:null})})},
 });return{api,writes,setOwner:v=>owner=v,setBranch:v=>branch=v,setFail:v=>fail=v};
}
test('role save writes only supported alerts, correct branch and exact selected roles',async()=>{
 const h=harness(),form=new FormData();form.set('branchId','branch');form.set('new_order:cashier','on');form.set('credit_overdue:owner','on');
 assert.equal((await h.api.saveNotificationRoleSettings({},form)).success,true);
 const rows=h.writes[0].rows;assert.equal(rows.length,7);assert.ok(rows.every(r=>r.location_id==='branch'&&r.business_id==='business'&&r.notification_type!=='credit_overdue'));
 assert.deepEqual(rows.find(r=>r.notification_type==='new_order').target_roles,['cashier']);assert.deepEqual(rows.find(r=>r.notification_type==='low_stock').target_roles,[]);
 h.setOwner(false);assert.equal((await h.api.saveNotificationRoleSettings({},form)).success,false);assert.equal(h.writes.length,1);
 h.setOwner(true);h.setBranch('other');assert.equal((await h.api.saveNotificationRoleSettings({},form)).success,false);assert.equal(h.writes.length,1);
});
test('personal preferences use authenticated identity and report failed writes',async()=>{
 const h=harness();assert.equal((await h.api.saveNotificationPreferences({sound:false,browser:true,user_id:'forged'})).success,true);
 assert.equal(h.writes[0].rows.user_id,'trusted-user');assert.equal(h.writes[0].rows.sound_enabled,false);assert.equal(h.writes[0].options.onConflict,'business_id,user_id');
 h.setFail(true);assert.equal((await h.api.saveNotificationPreferences({sound:true,browser:false})).success,false);
 assert.equal((await h.api.saveNotificationPreferences({sound:'true',browser:false})).success,false);
});
