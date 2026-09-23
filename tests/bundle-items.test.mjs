import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
function load(file,deps={}){const loaded={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(loaded,loaded.exports,id=>{if(!(id in deps))throw new Error('Unmocked dependency '+id);return deps[id];});return loaded.exports;}
test('bundle actions support every business mode and reject stale branch submissions',async()=>{
 for(const mode of ['standard','variant','configurable']){
  const calls=[];let branch='branch-1';
  const actions=load('app/(dashboard)/dashboard/products/bundle-actions.ts',{
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

test('bundle list renders separate visibility switches and permission-aware management actions',()=>{
 const require=createRequire(import.meta.url);const loaded={exports:{}};
 const deps={
  'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),
  'next/navigation':{useRouter:()=>({refresh:()=>{}})},'next/link':({children})=>children,
  'sonner':{toast:{}},'../products/bundle-product-form':()=>null,'../products/bundle-actions':{},
 };
 new Function('module','exports','require',ts.transpileModule(readFileSync('app/(dashboard)/dashboard/bundles/bundle-items-client.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText)(loaded,loaded.exports,id=>deps[id]);
 const props={branchId:'branch',branchName:'Main Branch',products:[],categories:[],canCreate:true,canPack:true,canEdit:true,canDelete:true,bundles:[{id:'bundle',name:'Starter Set',sku:'SET',price:10,cost:5,active:true,packed:true,stock:2,capacity:3,pos:false,online:true,description:null,categoryId:null,imageUrl:null,updatedAt:null,components:[]}]};
 const html=renderToStaticMarkup(React.createElement(loaded.exports.default,props));
 assert.match(html,/aria-checked="false" aria-label="Show Starter Set on POS"/);
 assert.match(html,/aria-checked="true" aria-label="Show Starter Set online"/);
 for(const label of ['View Starter Set','Edit Starter Set','Delete Starter Set'])assert.ok(html.includes(label));
 const readOnly=renderToStaticMarkup(React.createElement(loaded.exports.default,{...props,canEdit:false,canDelete:false,canCreate:false,canPack:false}));
 assert.ok(!readOnly.includes('Edit Starter Set'));assert.ok(!readOnly.includes('Delete Starter Set'));
 assert.match(readOnly,/aria-label="Show Starter Set on POS" disabled/);
});
