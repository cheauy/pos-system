import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as validation from '../lib/storefront/checkout-validation.ts';
import * as rpcOutcome from '../lib/operations/rpc-outcome.ts';
const source=ts.transpileModule(readFileSync(new URL('../app/api/storefront/[slug]/orders/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function setup({rpcError,throwRpc,uploadError}={}){
 const calls={rpc:0,uploads:[],removed:[],scopes:[]};
 const admin={from(table){const q={select(){return q},eq(key,value){calls.scopes.push([table,key,value]);return q},maybeSingle:async()=>({data:table==='businesses'?{id:'11111111-1111-4111-8111-111111111111',is_active:true}:{is_published:true,accept_online_orders:true,accept_khqr:true}})};return q},storage:{getBucket:async()=>({data:{public:false}}),from(){return {upload:async(path)=>{calls.uploads.push(path);return {error:uploadError??null}},remove:async(paths)=>{calls.removed.push(...paths);return {error:null}}}}},rpc:async(_name,args)=>{calls.rpc++;calls.args=args;if(throwRpc)throw throwRpc;return rpcError?{error:rpcError}:{data:{publicToken:'token'}}}};
 const deps={'@/lib/storefront/order-email':{sendOrderEmail:async()=> 'sent'},'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/supabase/admin':{supabaseAdmin:admin},'@/lib/tenancy/domain':{getSubdomainUrl:slug=>`https://${slug}.example.com`,normalizeTenantSlug:v=>v,getTenantSlugFromHost:()=>null},'@/lib/storefront/checkout-validation':validation,'@/lib/operations/rpc-outcome':rpcOutcome};
 const mod={exports:{}};new Function('require','module','exports',source)(key=>deps[key],mod,mod.exports);
 return {calls,post:mod.exports.POST};
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
test('confirmed order rollback removes its uploaded proof',async()=>{
 const ctx=setup({rpcError:{code:'P0001',message:'Stock unavailable'}});
 const result=await ctx.post(request(png()),{params:Promise.resolve({slug:'shop'})});
 assert.equal(result.status,400);assert.equal(result.body.uncertain,false);assert.equal(result.body.message,'Stock unavailable');assert.deepEqual(ctx.calls.removed,ctx.calls.uploads);
});
test('ambiguous returned RPC error retains proof and warns against submitting again',async()=>{
 const ctx=setup({rpcError:{code:'',message:'Failed to fetch'}});
 const result=await ctx.post(request(png()),{params:Promise.resolve({slug:'shop'})});
 assert.equal(result.status,503);assert.equal(result.body.uncertain,true);assert.match(result.body.message,/may have been placed/);assert.match(result.body.message,/before submitting again/);assert.equal(ctx.calls.rpc,1);assert.equal(ctx.calls.uploads.length,1);assert.equal(ctx.calls.removed.length,0);
});
test('thrown RPC transport error retains proof and warns against submitting again',async()=>{
 const ctx=setup({throwRpc:new TypeError('fetch failed')});
 const result=await ctx.post(request(png()),{params:Promise.resolve({slug:'shop'})});
 assert.equal(result.status,503);assert.equal(result.body.uncertain,true);assert.match(result.body.message,/before submitting again/);assert.equal(ctx.calls.rpc,1);assert.equal(ctx.calls.uploads.length,1);assert.equal(ctx.calls.removed.length,0);
});
test('proof upload failure cleans its path before order dispatch',async()=>{
 const ctx=setup({uploadError:{message:'Upload response lost'}});
 const result=await ctx.post(request(png()),{params:Promise.resolve({slug:'shop'})});
 assert.equal(result.status,500);assert.equal(result.body.uncertain,false);assert.equal(ctx.calls.rpc,0);assert.equal(ctx.calls.uploads.length,1);assert.deepEqual(ctx.calls.removed,ctx.calls.uploads);
});
