const test=require('node:test');const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const settings=loadTs('lib/notifications/settings.ts');
function harness(){
 let owner=true,branch='branch',fail='',refreshFail=false,user=true;const writes=[];
 const api=loadTs('app/(dashboard)/dashboard/notifications/actions.ts',{
  'next/cache':{revalidatePath(){}},'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',role:owner?'owner':'cashier'})},
  '@/lib/branches/context':{assertOperatingBranch:async id=>{if(id!==branch)throw Error('Branch changed');}},
  '@/lib/notifications/settings':settings,
  '@/lib/supabase/branch-server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:user?{id:'trusted-user'}:null},error:null})},from:table=>({upsert:async(rows,options)=>{writes.push({table,rows,options});return {error:fail===table?{}:null};}}),rpc:async()=>{if(refreshFail)throw Error('refresh unavailable');return {error:null};}})},
 });return{api,writes,setOwner:v=>owner=v,setBranch:v=>branch=v,setFail:v=>fail=v,setRefreshFail:v=>refreshFail=v,setUser:v=>user=v};
}
const input=()=>({businessId:'business',branchId:'branch',enabled:Object.fromEntries(settings.businessAlerts.map(({type})=>[type,type!=='low_stock'])),sound:false,browser:true,user_id:'forged',roles:['cashier']});
test('one save applies supported alert toggles using server role policy and authenticated preferences',async()=>{
 const h=harness();const result=await h.api.saveNotificationSettings(input());assert.equal(result.success,true);
 assert.equal(h.writes.length,2);const rows=h.writes[0].rows;
 assert.equal(rows.length,7);assert.ok(rows.every(r=>r.location_id==='branch'&&r.business_id==='business'));
 for(const rule of settings.businessAlerts)assert.deepEqual(rows.find(r=>r.notification_type===rule.type).target_roles,rule.type==='low_stock'?[]:rule.roles);
 assert.equal(h.writes[1].rows.user_id,'trusted-user');assert.equal(h.writes[1].rows.sound_enabled,false);assert.equal(h.writes[1].rows.browser_enabled,true);
});
test('owner, business, branch, session and boolean validation run before any writes',async()=>{
 const h=harness();h.setOwner(false);assert.equal((await h.api.saveNotificationSettings(input())).success,false);
 h.setOwner(true);assert.equal((await h.api.saveNotificationSettings({...input(),businessId:'other'})).success,false);
 h.setBranch('other');assert.equal((await h.api.saveNotificationSettings(input())).success,false);
 h.setBranch('branch');h.setUser(false);assert.equal((await h.api.saveNotificationSettings(input())).success,false);h.setUser(true);
 assert.equal((await h.api.saveNotificationSettings({...input(),sound:'false'})).success,false);
 assert.equal((await h.api.saveNotificationSettings({...input(),enabled:{new_order:true}})).success,false);
 assert.equal(h.writes.length,0);
});
test('failed and partial writes stay visible, while refresh failure never turns a completed save into failure',async()=>{
 const h=harness();h.setFail('branch_notification_role_settings');let result=await h.api.saveNotificationSettings(input());assert.equal(result.success,false);assert.equal(result.alertsSaved,false);assert.equal(h.writes.length,1);
 h.setFail('business_notification_preferences');result=await h.api.saveNotificationSettings(input());assert.equal(result.success,false);assert.equal(result.alertsSaved,true);assert.equal(result.preferencesSaved,false);assert.match(result.message,/Alerts saved, but/);
 h.setFail('');h.setRefreshFail(true);result=await h.api.saveNotificationSettings(input());assert.equal(result.success,true);assert.equal(result.preferencesSaved,true);assert.match(result.message,/next refresh/);
});

test('notification page uses nine switches, one Save, no role grid, and keeps changes local until saving',async()=>{
 const React=require('react');const state=[],refs=[],calls=[];let cursor=0,refCursor=0;
 const Form=loadTs('app/(dashboard)/dashboard/settings/alert-recipients-form.tsx',{
  react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef:initial=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});}},
  'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),
  '@/lib/notifications/settings':settings,'../notifications/actions':{saveNotificationSettings:async input=>{calls.push(input);return {success:true,alertsSaved:true,preferencesSaved:false,message:'Saved'};}},
 }).default;
 const props={businessId:'business',branchId:'branch',branchName:'Main',settings:{},soundEnabled:true,browserEnabled:false};
 const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...(typeof node.type==='function'&&node.type.name==='Toggle'?walk(node.type(node.props)):walk(node.props?.children))];
 const render=()=>{cursor=0;refCursor=0;return walk(Form(props));};
 const button=label=>render().find(n=>n.type==='button'&&(n.props.children===label||n.props.children?.includes?.(label)));
 assert.equal(render().filter(n=>n.props?.role==='switch').length,9);assert.equal(render().filter(n=>n.type==='button'&&n.props.type==='submit').length,1);assert.ok(!render().some(n=>n.type==='table'));
 const toggle=()=>render().find(n=>n.props?.role==='switch'&&n.props['aria-label']==='Low stock');
 toggle().props.onChange({target:{checked:false}});assert.equal(calls.length,0);button('Cancel').props.onClick();assert.equal(toggle().props.checked,true);
 toggle().props.onChange({target:{checked:false}});render()[0].props.onSubmit({preventDefault(){}});render()[0].props.onSubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);assert.equal(calls[0].enabled.low_stock,false);assert.equal(calls[0].sound,true);
});
