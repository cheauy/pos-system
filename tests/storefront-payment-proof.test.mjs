import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as validation from '../lib/storefront/checkout-validation.ts';
const source=ts.transpileModule(readFileSync(new URL('../app/api/storefront/[slug]/orders/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function setup(fail=false){
 const calls={rpc:0,uploads:[],removed:[],scopes:[]};
 const admin={from(table){const q={select(){return q},eq(key,value){calls.scopes.push([table,key,value]);return q},maybeSingle:async()=>({data:table==='businesses'?{id:'11111111-1111-4111-8111-111111111111'}:{is_published:true,accept_online_orders:true,accept_khqr:true}})};return q},storage:{getBucket:async()=>({data:{public:false}}),from(){return {upload:async(path)=>{calls.uploads.push(path);return {error:null}},remove:async(paths)=>{calls.removed.push(...paths);return {error:null}}}}},rpc:async(_name,args)=>{calls.rpc++;calls.args=args;return fail?{error:{message:'Stock unavailable'}}:{data:{publicToken:'token'}}}};
 const deps={'@/lib/storefront/order-email':{sendOrderEmail:async()=> 'sent'},'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/supabase/admin':{supabaseAdmin:admin},'@/lib/tenancy/domain':{getSubdomainUrl:slug=>`https://${slug}.example.com`,normalizeTenantSlug:v=>v,getTenantSlugFromHost:()=>null},'@/lib/storefront/checkout-validation':validation};
 const module={exports:{}};new Function('require','module','exports',source)(key=>deps[key],module,module.exports);
 return {calls,post:module.exports.POST};
}
const checkout={items:[{productId:'product',quantity:1}],guestName:'Customer',guestEmail:'customer@example.com',guestPhone:'012345678',guestAddress:'Street',fulfillmentType:'delivery',paymentMethod:'khqr'};
function request(proof){const form=new FormData();form.set('checkout',JSON.stringify(checkout));if(proof)form.set('paymentProof',proof);return {headers:new Headers({'content-type':'multipart/form-data'}),formData:async()=>form};}
const png=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10,0])],'proof.png',{type:'image/png'});
test('KHQR checkout refuses missing or disguised proof before placing an order',async()=>{
 for(const proof of [null,new File(['not an image'],'proof.png',{type:'image/png'})]){const ctx=setup();const result=await ctx.post(request(proof),{params:Promise.resolve({slug:'shop'})});assert.equal(result.status,400);assert.equal(ctx.calls.rpc,0);assert.equal(ctx.calls.uploads.length,0);}
});
test('proof is privately uploaded and attached to the transactional order call',async()=>{
 const ctx=setup();assert.equal((await ctx.post(request(png()),{params:Promise.resolve({slug:'shop'})})).status,200);assert.equal(ctx.calls.rpc,1);assert.equal(ctx.calls.args.p_checkout.p_payment_reference,`proof:${ctx.calls.uploads[0]}`);assert.equal(ctx.calls.removed.length,0);
});
test('failed order removes its uploaded proof',async()=>{
 const ctx=setup(true);assert.equal((await ctx.post(request(png()),{params:Promise.resolve({slug:'shop'})})).status,400);assert.deepEqual(ctx.calls.removed,ctx.calls.uploads);
});
