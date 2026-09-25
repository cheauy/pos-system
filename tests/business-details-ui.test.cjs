const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const presets=loadTs('lib/business/business-mode-presets.ts');
function nodes(root){if(!root||typeof root!=='object')return [];if(Array.isArray(root))return root.flatMap(nodes);return [root,...nodes(root.props?.children)];}
function load(){const state=[],refs=[];let cursor=0,refCursor=0;
 const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=v];},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useMemo:f=>f(),useTransition:()=>[false,fn=>fn()],useActionState:()=>[{error:''},()=>{}]};
 const Component=loadTs('app/(dashboard)/dashboard/settings/business/business-settings-client.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),react,'react-dom':{useFormStatus:()=>({pending:false})},'next/image':{default:()=>null},'next/link':{default:()=>null},'lucide-react':require('lucide-react'),'./credit-badges':{default:()=>null},'@/lib/business/business-mode-presets':presets,'@/lib/tenancy/domain':{normalizeTenantSlug:s=>s},'./actions':{checkStoreAddressAvailability:async()=>({available:true}),submitBusinessDetails:()=>{}}}).default;
 const props={businessName:'Test',currentBusinessType:'general',currentProductMode:'standard',initialSlug:'shop',rootDomain:'example.com',canEdit:true,subscriptionPlanKey:'solo',freeUrlChangesRemaining:0,freeBusinessModeChangesRemaining:0,urlCredits:0,modeCredits:0};
 return {render(overrides={}){cursor=0;refCursor=0;return nodes(Component({...props,...overrides}));}};
}
test('applying changes requires the centered confirmation; cancel never submits',()=>{
 const h=load();let tree=h.render({modeCredits:1});tree.find(n=>n.props?.preset?.value==='fashion').props.onSelect();tree=h.render({modeCredits:1});
 const form=tree.find(n=>n.type==='form'),dialog=tree.find(n=>n.type==='dialog');let opened=0,closed=0,submissions=0;
 dialog.props.ref.current={showModal(){opened++;},close(){closed++;}};
 let blocked=false;form.props.onSubmit({preventDefault(){blocked=true;}});assert.equal(blocked,true);assert.equal(opened,1);
 assert.match(dialog.props.className,/fixed inset-0 m-auto/);
 tree.find(n=>n.type==='button'&&n.props.children==='Cancel').props.onClick();assert.equal(closed,1);assert.equal(submissions,0);
 form.props.ref.current={requestSubmit(){let prevented=false;form.props.onSubmit({preventDefault(){prevented=true;}});if(!prevented)submissions++;}};
 tree.find(n=>n.type==='button'&&n.props.children==='Apply').props.onClick();assert.equal(submissions,1);
 blocked=false;form.props.onSubmit({preventDefault(){blocked=true;}});assert.equal(blocked,true);
});
test('Apply requires the right credits and displays the number of changes',()=>{
 const h=load();h.render().find(n=>n.props?.preset?.value==='fashion').props.onSelect();
 let tree=h.render();assert.equal(tree.find(n=>n.props?.count===1).props.disabled,true);
 tree=h.render({urlCredits:1});assert.equal(tree.find(n=>n.props?.count===1).props.disabled,true);
 tree=h.render({modeCredits:1});assert.equal(tree.find(n=>n.props?.count===1).props.disabled,false);assert.ok(tree.some(n=>n.type==='button'&&n.props.children==='Apply'));
 tree.find(n=>n.type==='input'&&n.props.name==='subdomain').props.onChange({target:{value:'new-shop'}});
 tree=h.render({modeCredits:1,urlCredits:1});assert.ok(tree.find(n=>n.props?.count===2));
});

test('Current stays on the saved business type when another type is selected',()=>{
 const h=load();let tree=h.render();
 const current=tree.find(n=>n.props?.preset?.value==='general');
 assert.equal(current.props.current,true);
 assert.ok(nodes(current.type(current.props)).some(n=>n.props.children==='Current'));
 tree.find(n=>n.props?.preset?.value==='fashion').props.onSelect();tree=h.render();
 assert.equal(tree.find(n=>n.props?.preset?.value==='general').props.current,true);
 assert.equal(tree.find(n=>n.props?.preset?.value==='fashion').props.current,false);
});

test('current details show business-scoped active counts and only its owner/admin names',async()=>{
 const log=[];
 const db={from(table){return queryDouble(table,call=>{
   if(table==='business_storefronts')return {data:{business_type:'general'}};
   if(table==='business_change_orders')return {data:null};
   if(table==='business_locations')return {count:2};
   if(table==='business_members')return call.steps.some(([op,,options])=>op==='select'&&options?.head)?{count:6}:{data:[{user_id:'owner-id',role:'owner'},{user_id:'admin-id',role:'admin'}]};
   if(table==='profiles')return {data:[{id:'owner-id',full_name:'Test Owner'},{id:'admin-id',full_name:'Test Admin'}]};
   throw Error(table);
 },log);}};
 const Page=loadTs('app/(dashboard)/dashboard/settings/business/page.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{default:()=>null},'lucide-react':require('lucide-react'),'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business-id',name:'Test Business',slug:'shop',productMode:'standard',role:'owner'})},'@/lib/business/business-mode-presets':presets,'@/lib/supabase/admin':{supabaseAdmin:db},'@/lib/subscriptions/entitlements':{getBusinessChangeEntitlements:async()=>({urlFreeRemaining:1,urlCredits:2,modeFreeRemaining:2,modeCredits:0})},'@/lib/tenancy/domain':{getRootDomain:()=> 'example.com'},'./business-settings-client':{default:()=>null},'./credit-badges':{default:()=>null}}).default;
 const tree=nodes(await Page({searchParams:Promise.resolve({})}));
 assert.ok(tree.some(n=>n.props.children==='Test Business'));
 assert.ok(tree.some(n=>n.type==='dd'&&n.props.children===6));
 assert.ok(tree.some(n=>n.type==='dd'&&n.props.children===2));
 assert.ok(tree.some(n=>Array.isArray(n.props.children)&&n.props.children.includes('Test Owner')));
 assert.ok(tree.some(n=>n.props.modeCredits===2&&n.props.urlCredits===3));
 for(const call of log.filter(q=>['business_members','business_locations'].includes(q.table))){assert.ok(call.steps.some(s=>s[0]==='eq'&&s[1]==='business_id'&&s[2]==='business-id'));assert.ok(call.steps.some(s=>s[0]==='eq'&&s[1]==='is_active'&&s[2]===true));}
 assert.deepEqual(log.find(q=>q.table==='profiles').steps.find(s=>s[0]==='in'),['in','id',['owner-id','admin-id']]);
});
