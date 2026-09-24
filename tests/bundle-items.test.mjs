import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs, queryDouble } from './helpers/load-ts.cjs';
function load(file,deps={}){const loaded={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(loaded,loaded.exports,id=>{if(!(id in deps))throw new Error('Unmocked dependency '+id);return deps[id];});return loaded.exports;}
test('bundle actions support every business mode and reject stale branch submissions',async()=>{
 for(const mode of ['standard','variant','configurable']){
  const calls=[];let branch='branch-1';
  const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
   '@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'31536000'},'node:crypto':crypto,
   'next/cache':{revalidatePath:()=>{}},
   '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business-1',product_mode:mode})},
   '@/lib/branches/context':{assertOperatingBranch:async id=>{if(id!==branch)throw new Error('stale');}},
   '@/lib/supabase/server':{createClient:async()=>({rpc:async(name,input)=>{calls.push({name,input});return {error:null};}})},
  });
  const form=new FormData();for(const [key,value] of Object.entries({name:'Set',sku:'SET',sellingPrice:'12',branchId:branch,requestId:'request-1',items:'[{"productId":"p1","quantity":1},{"productId":"p2","quantity":1}]'}))form.set(key,value);
  assert.equal((await actions.createBundleProduct({success:false,message:''},form)).success,true);
  assert.equal(calls[0].name,'tenh_create_packed_bundle');assert.equal(calls[0].input.p_branch_id,branch);
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
 assert.equal((many.match(/aria-label="View Set /g)||[]).length,20);
 assert.match(many,/Page 1 of 3/);
});

test('bundle image validates contents, stops on upload failure and reuses identical retry uploads',async()=>{
 const calls=[], uploads=[];let failUpload=false,duplicate=false;
 const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
  '@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'31536000'},'node:crypto':crypto,'next/cache':{revalidatePath:()=>{}},
  '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business'})},
  '@/lib/branches/context':{assertOperatingBranch:async()=>{}},
  '@/lib/supabase/server':{createClient:async()=>({
   auth:{getUser:async()=>({data:{user:{id:'user'}}})},
   storage:{from:()=>({upload:async(path,bytes,options)=>{uploads.push({path,options});return {error:failUpload?{statusCode:'500'}:duplicate?{statusCode:'409'}:null};},getPublicUrl:path=>({data:{publicUrl:`https://example.supabase.co/storage/v1/object/public/product-images/${path}`}})})},
   rpc:async(name,input)=>{calls.push({name,input});return {error:null};},
  })},
 });
 const form=new FormData();for(const [k,v] of Object.entries({name:'Set',sku:'SET',sellingPrice:'12',branchId:'branch',requestId:crypto.randomUUID(),items:'[]'}))form.set(k,v);
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
  '@/lib/supabase/server':{createClient:async()=>({from:table=>queryDouble(table,{data:{id:'bundle',updated_at:updatedAt},error:null},queries),rpc:async(name,input)=>{calls.push({name,input});return {error:null};}})},
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
  '@/components/product-variant-picker':{default:()=>null},'./bundle-actions':{},
 }).default;
 const products=['one','two'].map(id=>({id,name:id,sku:id,stock_quantity:10,cost_price:2,selling_price:5,groups:[],options:[]}));
 const initial={id:'bundle',name:'Saved Set',sku:'SAVED',price:12,categoryId:null,description:'Description',imageUrl:'https://example.test/photo.png',updatedAt:'2026-09-24T12:00:00Z',items:[{productId:'one',quantity:2,optionIds:[]},{productId:'two',quantity:1,optionIds:[]}]};
 const html=renderToStaticMarkup(React.createElement(Form,{products,categories:[],branchId:'branch',requestId:'request',initial}));
 assert.match(html,/Save changes/);assert.match(html,/value="Saved Set"/);assert.match(html,/src="https:\/\/example.test\/photo.png"/);assert.match(html,/Quantity for one/);assert.match(html,/Remove one/);assert.match(html,/name="image"/);
});
