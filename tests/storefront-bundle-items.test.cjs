const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const {readAllRows}=loadTs('lib/supabase/read-all-rows.ts');

function setup(fail=false){
 const log=[];
 const recipes=[{id:'r1',bundle_product_id:'bundle',component_product_id:'shirt',quantity:2},{id:'r2',bundle_product_id:'bundle',component_product_id:'trousers',quantity:1},{id:'r3',bundle_product_id:'bundle',component_product_id:'missing-photo',quantity:1}];
 const components=[{id:'shirt',name:'Shirt',size:'M',color:'Blue',variant_image_url:'variant.jpg',image_url:'main.jpg'}, {id:'trousers',name:'Trousers',size:'L',color:'Black',variant_image_url:null,image_url:'trousers.jpg'}, {id:'missing-photo',name:'Belt',size:null,color:null,image_url:null,variant_image_url:null}];
 const {storefrontBundleItems}=loadTs('lib/storefront/bundle-items.ts',{'server-only':{},'@/lib/supabase/admin':{supabaseAdmin:{from:table=>queryDouble(table,{data:table==='bundle_items'?recipes:components,error:fail?{message:'denied'}:null},log)}},'@/lib/supabase/read-all-rows':{readAllRows}});
 return {load:storefrontBundleItems,log};
}
test('bundle items use variant photos, fall back to product photos and retain quantities',async()=>{
 const {load,log}=setup();const items=(await load('business',['bundle'])).get('bundle');
 assert.deepEqual(items.map(item=>item.imageUrl),['variant.jpg','trousers.jpg',null]);
 assert.equal(items[0].quantity,2);assert.equal(items[0].size,'M');assert.equal(items[0].color,'Blue');
 assert.equal(log.length,2);
 for(const query of log){assert.ok(query.steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business'));assert.ok(!query.steps.find(step=>step[0]==='select')[1].includes('cost'));}
 assert.deepEqual(log[1].steps.find(step=>step[0]==='in'),['in','id',['shirt','trousers','missing-photo']]);
});
test('no bundle makes no extra requests; failed recipe reads do not silently show an empty bundle',async()=>{
 const {load,log}=setup();assert.equal((await load('business',[])).size,0);assert.equal(log.length,0);
 await assert.rejects(setup(true).load('business',['bundle']),/Unable to load included bundle items/);
});
