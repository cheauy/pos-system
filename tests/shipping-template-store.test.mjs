import test from 'node:test';
import assert from 'node:assert/strict';
import helpers from './helpers/load-ts.cjs';
import encoder from 'qrcode';
const {loadTs}=helpers;
const layout=loadTs('lib/receipts/shipping-layout.ts');
const qr={isOrderCode:v=>typeof v==='string'&&/^[1-9][0-9]{11}$/.test(v),orderQrSvg:()=>'<svg viewBox="0 0 41 41"></svg>'};
const custom=loadTs('lib/receipts/shipping-custom.ts',{qrcode:encoder,'./shipping-layout':layout,'@/lib/barcode/code39':loadTs('lib/barcode/code39.ts'),'@/lib/orders/order-qr':qr});
const templates=loadTs('lib/receipts/shipping-templates.ts',{'./shipping-layout':layout,'./shipping-custom':custom});
const entry=(id,name=id)=>({id,name,layout:layout.defaultShippingLayout('80x50')});
function harness({missing=false,permission=true,branch='branch-a',authorized='branch-order'}={}) {
 let catalog=null,tail=Promise.resolve();const writes=[],reads=[],rpc=[];
 const store=loadTs('lib/receipts/shipping-template-store.ts',{'server-only':{},'./shipping-templates':templates,'@/lib/branches/context':{getBranchContext:async()=>({business:{id:'business-a'},branchId:branch})},'@/lib/branches/order-access':{authorizedOrderBranch:async()=>authorized},'@/lib/supabase/admin':{supabaseAdmin:{from:table=>{assert.equal(table,'branch_shipping_templates');const query={select:()=>query,eq:(key,value)=>{reads.push([key,value]);return query;},maybeSingle:async()=>missing?{data:null,error:{code:'42P01',message:'missing table'}}:{data:catalog?{templates:catalog}:null,error:null}};return query;}}},'@/lib/supabase/branch-server':{createClient:async()=>({rpc:async(name,args)=>{
   rpc.push({name,args});const work=tail.then(async()=>{await new Promise(resolve=>setImmediate(resolve));if(missing)return {data:null,error:{code:'PGRST202',message:'missing RPC'}};if(!permission)return {data:null,error:{message:'Permission denied'}};
   const current=catalog??args.p_legacy.map(value=>({...value,revision:0})),existing=current.find(value=>value.id===args.p_entry.id);
   if(args.p_mode==='create'&&existing)return {data:null,error:{message:'Identity already exists'}};
   if(args.p_mode==='update'&&(!existing||existing.revision!==args.p_expected_revision))return {data:null,error:{message:'Stale revision'}};
   const saved={...args.p_entry,revision:args.p_expected_revision+1};const next=existing?current.map(value=>value.id===saved.id?saved:value):[...current,saved];
   try{catalog=templates.shippingCustomTemplates(JSON.stringify(next));writes.push(catalog);return {data:structuredClone(catalog),error:null};}catch(error){return {data:null,error:{message:error.message}};}
  });tail=work.then(()=>{});return work;}})}});
 return {store,writes,reads,rpc,catalog:()=>catalog};
}

test('concurrent RPC saves merge two creates and independently revised edits without losing unrelated templates',async()=>{
 const h=harness(),legacy=[entry('legacy')];
 await Promise.all(['first','second'].map(id=>h.store.persistShippingNamedTemplate('business-a',entry(id),'create',0,legacy)));
 assert.deepEqual(h.catalog().map(value=>value.id),['legacy','first','second']);
 await Promise.all(['first','second'].map(id=>h.store.persistShippingNamedTemplate('business-a',entry(id,id+' edited'),'update',1,legacy)));
 assert.equal(h.catalog()[0].revision,0);assert.ok(h.catalog().slice(1).every(value=>value.revision===2&&value.name.endsWith('edited')));
 assert.ok(h.rpc.every(call=>call.name==='tenh_save_shipping_template'&&call.args.p_location_id==='branch-a'));
});
test('same-template concurrent edits and duplicate branch names reject one operation without replacing the catalogue',async()=>{
 const h=harness();await h.store.persistShippingNamedTemplate('business-a',entry('first'),'create',0,[]);
 const edits=await Promise.allSettled(['A','B'].map(name=>h.store.persistShippingNamedTemplate('business-a',entry('first',name),'update',1,[])));
 assert.equal(edits.filter(value=>value.status==='fulfilled').length,1);assert.equal(h.catalog()[0].revision,2);
 const names=await Promise.allSettled(['second','third'].map(id=>h.store.persistShippingNamedTemplate('business-a',entry(id,'Same name'),'create',0,[])));
 assert.equal(names.filter(value=>value.status==='fulfilled').length,1);assert.equal(h.catalog().length,2);
});
test('read-only catalog lookup uses the authorized order branch and rejects unavailable document access',async()=>{
 const h=harness();assert.equal(await h.store.loadShippingTemplateCatalog('business-a','sample-order'),null);assert.deepEqual(h.reads,[['business_id','business-a'],['location_id','branch-order']]);assert.equal(h.rpc.length,0);
 const denied=harness({authorized:null});await assert.rejects(denied.store.loadShippingTemplateCatalog('business-a','sample-order'),/unavailable/);assert.equal(denied.reads.length,0);
 await assert.rejects(h.store.loadShippingTemplateCatalog('business-b'),/business changed/);
});
test('missing migration permits legacy read fallback but blocks writes; denied permission and invalid revisions never commit',async()=>{
 const absent=harness({missing:true});assert.equal(await absent.store.loadShippingTemplateCatalog('business-a'),null);
 await assert.rejects(absent.store.persistShippingNamedTemplate('business-a',entry('new'),'create',0,[]),/reviewed shipping custom template migration/);assert.equal(absent.writes.length,0);
 const denied=harness({permission:false});await assert.rejects(denied.store.persistShippingNamedTemplate('business-a',entry('new'),'create',0,[]),/Permission denied/);
 await assert.rejects(denied.store.persistShippingNamedTemplate('business-a',entry('new'),'update',-1,[]),/Reopen/);assert.equal(denied.writes.length,0);
});

test('canonical catalog overrides stale storage JSON without read-time imports or writes',async()=>{
 const canonical=[{...entry('canonical'),revision:2}],legacy=[entry('legacy')];let writes=0;
 const raw={shipping_label_size:'80x50',shipping_template:'custom:canonical',shipping_custom_templates:JSON.stringify(legacy),...Object.fromEntries(templates.SHIPPING_VISIBILITY_FLAGS.map(flag=>[`shipping_show_${flag}`,true]))};
 const api=loadTs('lib/receipts/shipping-design-store.ts',{'server-only':{},'./shipping-templates':templates,'./shipping-layout':layout,'./shipping-template-store':{loadShippingTemplateCatalog:async()=>canonical},'@/lib/branches/context':{getBranchContext:async()=>({business:{id:'business-a'},branchId:'branch-a'})},'@/lib/branches/order-access':{authorizedOrderBranch:async()=> 'branch-a'},'@/lib/supabase/admin':{supabaseAdmin:{storage:{from:()=>({download:async()=>({data:{text:async()=>JSON.stringify(raw)},error:null}),upload:async()=>{writes++;}})}}}});
 const saved=await api.loadShippingSettings('business-a');assert.deepEqual(JSON.parse(saved.shipping_custom_templates),canonical);assert.equal(saved.shipping_template,'custom:canonical');assert.equal(writes,0);
});
