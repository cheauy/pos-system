const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const {readAllRows}=loadTs('lib/supabase/read-all-rows.ts');

function setup({empty=false,fail=false}={}) {
  const log=[];
  const recipes=empty?[]:['shirt','trousers','duplicate','missing'].map(component_product_id=>({component_product_id}));
  const components=[
    {id:'shirt',variant_image_url:'variant.jpg',image_url:'main.jpg'},
    {id:'trousers',variant_image_url:null,image_url:'trousers.jpg'},
    {id:'duplicate',variant_image_url:null,image_url:'variant.jpg'},
    {id:'missing',variant_image_url:null,image_url:null},
  ];
  const {storefrontBundlePhotos}=loadTs('lib/storefront/bundle-items.ts',{
    'server-only':{},
    '@/lib/supabase/admin':{supabaseAdmin:{from:table=>queryDouble(table,{data:table==='bundle_items'?recipes:components,error:fail?{message:'denied'}:null},log)}},
    '@/lib/supabase/read-all-rows':{readAllRows},
  });
  return {load:storefrontBundlePhotos,log};
}

test('gallery uses variant photos then product fallback, omits missing and duplicate photos, and scopes reads',async()=>{
  const {load,log}=setup();
  assert.deepEqual(await load('business','bundle'),['variant.jpg','trousers.jpg']);
  assert.equal(log.length,2);
  for(const query of log) assert.ok(query.steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business'));
  assert.ok(log[0].steps.some(step=>step[0]==='eq'&&step[1]==='bundle_product_id'&&step[2]==='bundle'));
  assert.deepEqual(log[1].steps.find(step=>step[0]==='select'),['select','id,image_url,variant_image_url']);
  assert.deepEqual(log[1].steps.find(step=>step[0]==='in'),['in','id',['shirt','trousers','duplicate','missing']]);
});

test('empty recipe skips product reads and query failures remain visible',async()=>{
  const {load,log}=setup({empty:true});
  assert.deepEqual(await load('business','bundle'),[]);
  assert.equal(log.length,1);
  await assert.rejects(setup({fail:true}).load('business','bundle'),/Unable to load included bundle photos/);
});
