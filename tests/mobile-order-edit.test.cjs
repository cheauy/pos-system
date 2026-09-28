const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file=ts.createSourceFile('route.ts',fs.readFileSync('app/api/mobile/[feature]/route.ts','utf8'),ts.ScriptTarget.Latest,true);
let edit;
function visit(node){if(ts.isIfStatement(node)&&node.expression.getText(file)==="body.action === 'edit'")edit=node;ts.forEachChild(node,visit);}
visit(file);
const js=ts.transpileModule(edit.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function execute(body,load,save){
 const context={body,id:'order',business:{id:'business'},RequestError:Error,loadOrderDetail:load,saveOrderWorkspaceDetails:save,response:(result,status)=>({result,status})};
 return new Function(...Object.keys(context),'return (async()=>{'+js+'})()')(...Object.values(context));
}
const valid={action:'edit',updatedAt:'2026-09-28T00:00:00Z',note:'Note',guestName:'Sam',guestPhone:'123',guestAddress:'Street'};
test('mobile order editing validates details before reading or saving',async()=>{
 for(const body of [{...valid,note:null},{...valid,updatedAt:'invalid'},{...valid,guestName:'x'.repeat(501)}])
  await assert.rejects(()=>execute(body,()=>assert.fail('must validate first'),()=>assert.fail('must not save')),/Review order details/);
});
test('mobile order edit checks readable branch scope and preserves version conflicts',async()=>{
 await assert.rejects(()=>execute(valid,async()=>{throw new Error('Order unavailable in this branch');},()=>assert.fail('out of scope save')),/branch/);
 const calls=[];
 const result=await execute(valid,async(...args)=>calls.push(['read',...args]),async(...args)=>{calls.push(['save',...args]);return {success:false,message:'Order changed'};});
 assert.deepEqual(calls[0],['read','business','order']);
 assert.equal(calls[1][2],valid.updatedAt);assert.equal(calls[1][4],'business');assert.equal(result.status,409);
});
