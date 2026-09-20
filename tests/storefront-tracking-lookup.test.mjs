import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(readFileSync(new URL("../app/api/storefront/[slug]/track/route.ts", import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function setup(host = "shop", found = true) {
 const scopes = [];
 const admin = {from(table) { const q = {select(){return q},eq(key,value){scopes.push([table,key,value]);return q},in(){return q},maybeSingle:async()=>({data: table === "businesses" ? {id:"business"} : found ? {public_order_token:"token"} : null})};return q;}};
 const deps = {"next/server":{NextResponse:{json:(body,options)=>({body,...options})}},"@/lib/supabase/admin":{supabaseAdmin:admin},"@/lib/tenancy/domain":{normalizeTenantSlug:v=>v,getTenantSlugFromHost:()=>host}};
 const module = {exports:{}};new Function("require","module","exports",source)(id=>deps[id],module,module.exports);
 return {scopes,run: number => module.exports.POST({headers:new Headers(),json:async()=>({orderNumber:number})},{params:Promise.resolve({slug:"shop"})})};
}
test("WEB tracking lookup is restricted to the selected store and never returns customer data", async()=>{
 const ctx=setup(); const result=await ctx.run("web-555e962f02");assert.equal(result.status,200);assert.deepEqual(result.body,{token:"token"});assert.ok(ctx.scopes.some(([table,key,value])=>table==="orders"&&key==="business_id"&&value==="business"));
 assert.equal((await setup("other").run("WEB-555E962F02")).status,404);
 assert.equal((await setup().run("WEB-123")).status,400);
 assert.equal((await setup("shop",false).run("WEB-555E962F02")).status,404);
});
