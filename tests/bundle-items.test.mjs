import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs, queryDouble } from './helpers/load-ts.cjs';
const bundleItemRules=loadTs('lib/products/bundle-items.ts');
test('bundle limits accept 2–8 distinct products and reject invalid quantities',()=>{
 const items=Array.from({length:8},(_,i)=>({productId:String(i),quantity:1,optionIds:[]}));
 assert.equal(bundleItemRules.validateBundleItems(items),null);
 assert.equal(bundleItemRules.validateBundleItems(items.slice(0,2)),null);
 assert.match(bundleItemRules.validateBundleItems([...items,{productId:'9',quantity:1}]),/2–8/);
 assert.match(bundleItemRules.validateBundleItems(items.slice(0,1)),/2–8/);
 assert.match(bundleItemRules.validateBundleItems([items[0],items[0]]),/each product once/);
 for(const quantity of [0,-1,1.5,1000])assert.match(bundleItemRules.validateBundleItems([{...items[0],quantity},items[1]]),/whole numbers/);
});

test('editing removes and replaces old items, adds a third, and stops at eight',()=>{
 const require=createRequire(import.meta.url);let cursor=0;const state=[];
 const Picker=()=>null;
 const Form=loadTs('app/(dashboard)/dashboard/products/bundle-product-form.tsx',{
  react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useMemo:fn=>fn(),useRef:v=>({current:v})},
  'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),sonner:{toast:{}},
  '@/components/product-gallery-input':{default:()=>null},'@/components/product-variant-picker':{default:Picker},
  '@/components/product-photo':{default:()=>null},'@/lib/products/bundle-items':bundleItemRules,'./bundle-actions':{},
 }).default;
 const products=Array.from({length:10},(_,i)=>({id:String(i),name:'Product '+i,sku:String(i),stock_quantity:10,cost_price:2,selling_price:5,groups:[],options:[]}));
 const props={products,categories:[],branchId:'branch',requestId:'request',initial:{id:'bundle',name:'Set',stock:0,items:[{productId:'0',quantity:1,optionIds:[]},{productId:'1',quantity:1,optionIds:[]}]}};
 const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
 const render=()=>{cursor=0;return walk(Form(props));};
 const items=()=>JSON.parse(render().find(n=>n.props?.name==='items').props.value);
 const add=id=>{render().find(n=>n.type===Picker).props.onChange(id);render().find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes(' Add')).props.onClick();};
 add('2');assert.equal(items().length,3);
 render().find(n=>n.props?.['aria-label']==='Remove Product 0').props.onClick();
 add('3');assert.deepEqual(items().map(x=>x.productId),['1','2','3']);
 for(const id of ['4','5','6','7','8'])add(id);
 assert.equal(items().length,8);add('9');assert.equal(items().length,8);
 render().find(n=>n.props?.['aria-label']==='Remove Product 1').props.onClick();add('9');
 assert.equal(items().length,8);assert.ok(items().some(x=>x.productId==='9'));assert.ok(!items().some(x=>x.productId==='1'));
});
function load(file,deps={}){deps={'@/lib/products/bundle-items':bundleItemRules,...deps};const loaded={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(loaded,loaded.exports,id=>{if(!(id in deps))throw new Error('Unmocked dependency '+id);return deps[id];});return loaded.exports;}
test('bundle actions support every business mode and reject stale branch submissions',async()=>{
 for(const mode of ['standard','variant','configurable']){
  const calls=[];let branch='branch-1';
  const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
   '@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'31536000'},'node:crypto':crypto,
   'next/cache':{revalidatePath:()=>{}},
   '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business-1',product_mode:mode})},
   '@/lib/branches/context':{assertOperatingBranch:async id=>{if(id!==branch)throw new Error('stale');}},
   '@/lib/supabase/branch-server':{createClient:async()=>({rpc:async(name,input)=>{calls.push({name,input});return {error:null};}})},
  });
  const form=new FormData();for(const [key,value] of Object.entries({name:'Set',sku:'SET',sellingPrice:'12',branchId:branch,requestId:'request-1',items:'[{"productId":"p1","quantity":1},{"productId":"p2","quantity":1}]'}))form.set(key,value);
  assert.equal((await actions.createBundleProduct({success:false,message:''},form)).success,true);
  assert.equal(calls[0].input.p_input.isPos,false);assert.equal(calls[0].input.p_input.isOnline,false);assert.equal(calls[0].name,'tenh_create_packed_bundle');assert.equal(calls[0].input.p_branch_id,branch);
  assert.equal((await actions.packBundle({branchId:branch,bundleId:'bundle-1',quantity:-2,requestId:'request-2'})).success,true);
  assert.equal(calls[1].input.p_quantity,-2);
  branch='branch-2';assert.equal((await actions.createBundleProduct({success:false,message:''},form)).success,false);
  assert.equal(calls.length,2);
 }
});

test('bundle list renders status and permission-aware three-dot actions',()=>{
 const require=createRequire(import.meta.url);const loaded={exports:{}};
 const deps={
  'next/dynamic':{default:()=>()=>null},'@/components/product-photo':{default:({sizes,...props})=>React.createElement('img',props)},
  'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),
  'next/navigation':{useRouter:()=>({refresh:()=>{}})},'next/link':({children})=>children,
  'sonner':{toast:{}},'../products/bundle-product-form':()=>null,'../products/bundle-actions':{},
 };
 new Function('module','exports','require',ts.transpileModule(readFileSync('app/(dashboard)/dashboard/bundles/bundle-items-client.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText)(loaded,loaded.exports,id=>deps[id]);
 const props={branchId:'branch',branchName:'Main Branch',products:[],categories:[],canCreate:true,canPack:true,canEdit:true,canDelete:true,bundles:[{id:'bundle',name:'Starter Set',sku:'SET',price:10,cost:5,active:true,packed:true,stock:2,capacity:3,pos:false,online:true,description:null,categoryId:null,imageUrl:null,updatedAt:null,components:[]}]};
 const html=renderToStaticMarkup(React.createElement(loaded.exports.default,props));
 assert.ok(!html.includes('role="switch"'));
 assert.match(html,/>Status<\/th>/);
 assert.match(html,/Actions for Starter Set/);
 assert.match(html,/popover="auto"/);
 const hidden=renderToStaticMarkup(React.createElement(loaded.exports.default,{...props,bundles:[{...props.bundles[0],pos:false,online:false}]}));
 assert.match(hidden,/>Inactive<\/span>/);

 for(const label of ['View Starter Set','Edit Starter Set','Delete Starter Set'])assert.ok(html.includes(label));
 const readOnly=renderToStaticMarkup(React.createElement(loaded.exports.default,{...props,canEdit:false,canDelete:false,canCreate:false,canPack:false}));
 assert.ok(!readOnly.includes('Edit Starter Set'));assert.ok(!readOnly.includes('Delete Starter Set'));
 assert.ok(!readOnly.includes('Actions for Starter Set'));
 const many=renderToStaticMarkup(React.createElement(loaded.exports.default,{...props,bundles:Array.from({length:45},(_,i)=>({...props.bundles[0],id:`bundle-${i}`,name:`Set ${i}`}))}));
 assert.equal((many.match(/aria-label="View Set /g)||[]).length,15);
 assert.match(many,/Page 1 of 3/);
});

test('bundle image validates contents, stops on upload failure and reuses identical retry uploads',async()=>{
 const calls=[], uploads=[];let failUpload=false,duplicate=false;
 const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
  '@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'31536000'},'node:crypto':crypto,'next/cache':{revalidatePath:()=>{}},
  '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business'})},
  '@/lib/branches/context':{assertOperatingBranch:async()=>{}},
  '@/lib/supabase/branch-server':{createClient:async()=>({
   auth:{getUser:async()=>({data:{user:{id:'user'}}})},
   storage:{from:()=>({upload:async(path,bytes,options)=>{uploads.push({path,options});return {error:failUpload?{statusCode:'500'}:duplicate?{statusCode:'409'}:null};},getPublicUrl:path=>({data:{publicUrl:`https://example.supabase.co/storage/v1/object/public/product-images/${path}`}})})},
   rpc:async(name,input)=>{calls.push({name,input});return {error:null};},
  })},
 });
 const form=new FormData();for(const [k,v] of Object.entries({name:'Set',sku:'SET',sellingPrice:'12',branchId:'branch',requestId:crypto.randomUUID(),items:'[{"productId":"one","quantity":1},{"productId":"two","quantity":1}]'}))form.set(k,v);
 const run=()=>actions.createBundleProduct({success:false,message:''},form);
 form.set('image',new File(['not an image'],'fake.png',{type:'image/png'}));
 assert.equal((await run()).success,false);assert.equal(uploads.length,0);assert.equal(calls.length,0);
 form.set('image',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'set.png',{type:'image/png'}));
 failUpload=true;assert.equal((await run()).success,false);assert.equal(calls.length,0);
 failUpload=false;assert.equal((await run()).success,true);
 duplicate=true;assert.equal((await run()).success,true);
 assert.equal(calls[0].name,'tenh_create_packed_bundle_with_image');
 assert.deepEqual(calls[0],calls[1]);assert.equal(uploads[0].path,uploads[2].path);assert.equal(uploads[0].options.upsert,false);
});

test('bundle edit sends contents and image removal atomically and rejects stale metadata', async () => {
 const calls=[],permissions=[],queries=[];let updatedAt='2026-09-24T12:00:00Z';
 const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
  '@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'31536000'},'node:crypto':crypto,'next/cache':{revalidatePath:()=>{}},
  '@/lib/auth/require-permission':{requirePermission:async permission=>{permissions.push(permission);return {id:'business',slug:'shop'};}},
  '@/lib/branches/context':{assertOperatingBranch:async()=>{}},
  '@/lib/supabase/branch-server':{createClient:async()=>({from:table=>queryDouble(table,{data:{id:'bundle',updated_at:updatedAt},error:null},queries),rpc:async(name,input)=>{calls.push({name,input});return {error:null};}})},
 });
 const form=new FormData();for(const [key,value] of Object.entries({bundleId:'bundle',branchId:'branch',expected:updatedAt,name:'New Set',sku:'SET',sellingPrice:'15',items:'[{"productId":"one","quantity":2,"optionIds":[]},{"productId":"two","quantity":1,"optionIds":[]}]',removeImage:'true'}))form.set(key,value);
 assert.equal((await actions.editBundleProduct(form)).success,true);
 assert.equal(permissions[0],'products.update');assert.equal(calls[0].name,'tenh_manage_bundle');
 assert.equal(calls[0].input.p_action,'edit');assert.equal(calls[0].input.p_input.removeImage,true);
 assert.equal(calls[0].input.p_input.items[0].quantity,2);assert.equal(calls[0].input.p_expected,updatedAt);
 updatedAt='2026-09-24T13:00:00Z';assert.equal((await actions.editBundleProduct(form)).success,false);assert.equal(calls.length,1);
});

test('edit form restores its image and component quantities for editing', () => {
 const require=createRequire(import.meta.url);
 const Form=loadTs('app/(dashboard)/dashboard/products/bundle-product-form.tsx',{
  react:React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),sonner:{toast:{}},
  '@/components/product-gallery-input':{default:({initialUrls})=>React.createElement('div', {'data-gallery':true},initialUrls.map(url=>React.createElement('img',{key:url,src:url})))},
  '@/components/product-variant-picker':{default:()=>null},'./bundle-actions':{},'@/lib/products/bundle-items':bundleItemRules,'@/components/product-photo':{default:({sizes,...props})=>React.createElement('img',props)},
 }).default;
 const products=['one','two'].map(id=>({id,name:id,sku:id,imageUrl:'https://example.test/'+id+'.png',stock_quantity:10,cost_price:2,selling_price:5,groups:[],options:[]}));
 const initial={id:'bundle',name:'Saved Set',sku:'SAVED',price:12,categoryId:null,description:'Description',imageUrl:'https://example.test/photo.png',updatedAt:'2026-09-24T12:00:00Z',items:[{productId:'one',quantity:2,optionIds:[]},{productId:'two',quantity:1,optionIds:[]}]};
 const createHtml=renderToStaticMarkup(React.createElement(Form,{products,categories:[],branchId:'branch',requestId:'request'}));
 for(const name of ['showPos','showOnline'])assert.match(createHtml,new RegExp(`(?=[^<]*name="${name}")(?=[^<]*checked="")[^<]*`));
 assert.ok(createHtml.indexOf('name="showOnline"')<createHtml.indexOf('id="bundle-description"'));
 const html=renderToStaticMarkup(React.createElement(Form,{products,categories:[],branchId:'branch',requestId:'request',initial}));
 assert.match(html,/Save changes/);assert.match(html,/value="Saved Set"/);assert.match(html,/src="https:\/\/example.test\/photo.png"/);assert.match(html,/Quantity for one/);assert.match(html,/Remove one/);assert.match(html,/data-gallery="true"/);
 const missingHtml=renderToStaticMarkup(React.createElement(Form,{products:[],categories:[],branchId:'branch',requestId:'request',initial:{...initial,items:initial.items.map(item=>({...item,name:'Saved '+item.productId,sku:'SAVED-SKU'}))}}));
 assert.match(missingHtml,/Saved one/);assert.match(missingHtml,/Saved two/);assert.match(missingHtml,/remains in this bundle/);
 assert.match(html,/src="https:\/\/example.test\/one.png"/);
 const packed=renderToStaticMarkup(React.createElement(Form,{products,categories:[],branchId:'branch',requestId:'request',initial:{...initial,stock:6},onUnpackItems:()=>{}}));
 assert.match(packed,/Unpack to edit items/);assert.match(packed,/<fieldset disabled="">/);
 assert.ok(html.indexOf('Included products') < html.indexOf('data-gallery'));

});

test('bundle gallery saves every photo, preserves ordering and rejects foreign URLs', async () => {
 const calls=[],queries=[];let authChecks=0,activeUploads=0,maxUploads=0;
 const urls=['https://example.test/front.png','https://example.test/back.png'];
 const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
  '@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'31536000'},'node:crypto':crypto,'next/cache':{revalidatePath:()=>{}},
  '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',slug:'shop'})},
  '@/lib/branches/context':{assertOperatingBranch:async()=>{}},
  '@/lib/supabase/branch-server':{createClient:async()=>({
   from:table=>queryDouble(table,{data:{id:'bundle',updated_at:'version',image_url:urls[0],image_urls:urls},error:null},queries),
   rpc:async(name,input)=>{calls.push({name,input});return {data:'bundle',error:null};},
   auth:{getUser:async()=>{authChecks++;return {data:{user:{id:'user'}}};}},
   storage:{from:()=>({upload:async()=>{activeUploads++;maxUploads=Math.max(maxUploads,activeUploads);await new Promise(resolve=>setTimeout(resolve,1));activeUploads--;return {error:null};},getPublicUrl:path=>({data:{publicUrl:`https://example.test/storage/v1/object/public/product-images/${path}`}})})},
  })},
 });
 const form=new FormData();for(const [key,value] of Object.entries({bundleId:'bundle',branchId:'branch',requestId:crypto.randomUUID(),expected:'version',name:'Set',sku:'SET',sellingPrice:'10',items:'[{"productId":"one","quantity":1},{"productId":"two","quantity":1}]'}))form.set(key,value);
 form.set('productGallery',JSON.stringify([{url:urls[1]},{url:urls[0]}]));
 assert.equal((await actions.editBundleProduct(form)).success,true);
 const updates=queries.flatMap(query=>query.steps.filter(([name])=>name==='update').map(([,args])=>args));
 assert.equal(updates.length,2);assert.deepEqual(updates[0].image_urls,[urls[1],urls[0]]);assert.equal(updates[0].image_url,urls[1]);
 form.set('productGallery',JSON.stringify([{url:'https://foreign.test/photo.png'}]));
 assert.equal((await actions.editBundleProduct(form)).success,false);assert.equal(calls.length,1);
 form.set('productGallery',JSON.stringify([{slot:'front'},{slot:'back'}]));
 for(const [index,slot] of ['front','back'].entries())form.set(`gallery_${slot}`,new File([new Uint8Array([137,80,78,71,13,10,26,10,index])],`${slot}.png`,{type:'image/png'}));
 assert.equal((await actions.createBundleProduct({},form)).success,true);
 const last=queries.at(-1).steps.find(([name])=>name==='update')[1];
 assert.equal(last.image_urls.length,2);assert.notEqual(last.image_urls[0],last.image_urls[1]);assert.equal(last.image_url,last.image_urls[0]);assert.equal(authChecks,1);assert.equal(maxUploads,2);
});

test('bundle selection, grid view and deletion confirmation remain separate from detail navigation', () => {
 const require=createRequire(import.meta.url);let cursor=0;const state=[];
 const Client=loadTs('app/(dashboard)/dashboard/bundles/bundle-items-client.tsx',{
  react:{useState:initial=>{const id=cursor++;if(!(id in state))state[id]=initial;return [state[id],value=>{state[id]=typeof value==='function'?value(state[id]):value;}];},useRef:value=>({current:value}),useId:()=> 'id',useEffect(){},useMemo:fn=>fn(),useCallback:fn=>fn,useDeferredValue:value=>value,useTransition:()=>[false,fn=>fn()]},
  'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),'next/navigation':{useRouter:()=>({refresh(){}})},'next/link':{default:'a'},'next/dynamic':{default:()=>()=>null},
  '@/components/product-photo':{default:'img'},'@/components/anchored-action-menu':{default:'actions'},sonner:{toast:{},Toaster:'toast-status'},'../products/bundle-actions':{},
 }).default;
 const props={branchId:'branch',branchName:'Main',categories:[],products:[{id:'one',canInclude:true},{id:'two',canInclude:true}],canCreate:true,canPack:true,canEdit:true,canDelete:true,bundles:[{id:'b',name:'Set',sku:'SET',price:5,cost:2,stock:0,capacity:3,packed:true,active:true,online:true,pos:true,components:[]}]};
 const render=()=>{cursor=0;return Client(props);};
 const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
 const find=predicate=>nodes(render()).find(predicate);
 find(node=>node.props?.['aria-label']==='Select Set').props.onChange();
 assert.equal(find(node=>node.props?.title==='Bundle details'),undefined);
 const actions=find(node=>node.type==='actions');assert.equal(actions.props.label,'Actions (1)');assert.equal(nodes(actions).filter(node=>node.type==='button').length,1);
 find(node=>node.type==='button'&&node.props.children?.includes?.('Delete selected')).props.onClick();
 assert.ok(find(node=>node.props?.title==='Delete 1 bundles?'));
 find(node=>node.props?.title==='Delete 1 bundles?').props.close();
 find(node=>node.props?.['aria-label']==='Grid view').props.onClick();
 assert.ok(find(node=>node.type==='article'));
 find(node=>node.type==='button'&&node.props.className==='block w-full text-left').props.onClick();
 const detail=find(node=>node.props?.title==='Bundle details');assert.equal(detail.props.side,true);
 assert.ok(nodes(detail.props.footer).find(node=>node.type==='button'&&node.props.children?.includes?.('Delete bundle')));
 const drawer=detail.type(detail.props);
 assert.equal(drawer.type,'dialog');
 assert.ok(nodes(drawer).some(node=>node.type==='toast-status'&&node.props.position==='top-right'));
 assert.equal(drawer.props.style.width,'min(520px, 100vw)');
 assert.equal(drawer.props.style.inset,'0 0 0 auto');
 assert.equal(drawer.props.style.maxHeight,'100dvh');
 assert.ok(nodes(drawer).find(node=>node.type==='p'&&node.props.className.includes('text-blue-600')&&node.props.children==='Bundle details'));
 find(node=>node.type==='button'&&node.props.children?.includes?.('Edit')).props.onClick();
 const edit=find(node=>node.props?.title==='Edit bundle');assert.equal(edit.props.side,true);
 edit.props.close();
 find(node=>node.type==='button'&&node.props.children?.includes?.('Add Bundle')).props.onClick();
 const create=find(node=>node.props?.title==='New bundle');
 assert.equal(create.props.side,true);
 assert.equal(create.type(create.props).props.style.width,'min(520px, 100vw)');
 const firstForm=find(node=>node.props?.requestId&&node.props?.onCreated);
 const firstRequestId=firstForm.props.requestId;
 firstForm.props.onPendingChange(true);
 firstForm.props.onCreated();
 const addAgain=find(node=>node.type==='button'&&node.props.children?.includes?.('Add Bundle'));
 assert.equal(addAgain.props.disabled,false,'successful save releases the create lock');
 addAgain.props.onClick();
 const secondForm=find(node=>node.props?.requestId&&node.props?.onCreated);
 assert.notEqual(secondForm.props.requestId,firstRequestId,'each new bundle must have a fresh idempotency key');
 assert.notEqual(secondForm.key,firstForm.key,'a new form must not reuse the previous draft');
 assert.equal(secondForm.props.initial,undefined);

});

test('delete retires a historical bundle with both channels off and keeps other failures blocked',async()=>{
 let message='This bundle has transaction history. Turn off POS and Online visibility to keep the history safe.';
 const queries=[];
 const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
  '@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'31536000'},'node:crypto':crypto,'next/cache':{revalidatePath(){}},
  '@/lib/auth/require-permission':{requirePermission:async permission=>{assert.equal(permission,'products.disable');return {id:'business',slug:'shop'};}},
  '@/lib/branches/context':{assertOperatingBranch:async()=>{}},
  '@/lib/supabase/branch-server':{createClient:async()=>({rpc:async()=>({error:{message}}),from:table=>queryDouble(table,{data:{id:'bundle'},error:null},queries)})},
 });
 const input={branchId:'branch',bundleId:'bundle',action:'delete',expected:'version',values:{}};
 assert.equal((await actions.manageBundle(input)).success,true);
 assert.equal(queries.length,1);assert.equal(queries[0].table,'branch_products');
 const payload=queries[0].steps.find(([name])=>name==='update')[1];
 assert.equal(payload.is_active,false);assert.equal(payload.is_pos,false);assert.equal(payload.is_online,false);
 assert.ok(queries[0].steps.some(([name,...args])=>name==='eq'&&args[0]==='updated_at'&&args[1]==='version'));
 for(const failure of ['Unpack or transfer remaining stock before deleting. You can hide this bundle instead.','This bundle changed. Refresh and try again.']){
  message=failure;assert.equal((await actions.manageBundle(input)).success,false);
 }
 assert.equal(queries.length,1,'stock and version failures must not retire the bundle');
});

test('bundle create overlaps independent checks and reuses the verified branch user for photos',async()=>{
 let releasePermission;const permission=new Promise(resolve=>{releasePermission=resolve;});let uploads=0;
 const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
  '@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'31536000'},'node:crypto':crypto,'next/cache':{revalidatePath(){}},
  '@/lib/auth/require-permission':{requirePermission:()=>permission},
  '@/lib/branches/context':{assertOperatingBranch:async()=>{releasePermission({id:'business'});return {userId:'verified-user'};}},
  '@/lib/supabase/branch-server':{createClient:async()=>({
   auth:{getUser:async()=>{throw Error('Repeated authentication');}},
   storage:{from:()=>({upload:async path=>{assert.match(path,/business\/verified-user\//);uploads++;return {error:null};},getPublicUrl:path=>({data:{publicUrl:`https://example.test/storage/v1/object/public/product-images/${path}`}})})},
   rpc:async()=>({data:'bundle',error:null}),
  })},
 });
 const form=new FormData();form.set('branchId','branch');form.set('requestId',crypto.randomUUID());form.set('items','[{"productId":"one","quantity":1},{"productId":"two","quantity":1}]');
 form.set('image',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'photo.png',{type:'image/png'}));
 const result=await actions.createBundleProduct({},form);assert.equal(result.success,true);assert.equal(uploads,1);
});
