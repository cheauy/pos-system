const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=ts.createSourceFile('route.ts',fs.readFileSync('app/api/mobile/[feature]/route.ts','utf8'),ts.ScriptTarget.Latest,true);
let action;function visit(node){if(ts.isIfStatement(node)&&node.expression.getText(source)==="feature === 'account-categories'")action=node;ts.forEachChild(node,visit);}visit(source);
const js=ts.transpileModule(action.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function run(body,existing,permissions=['categories.manage']){
 const calls=[];const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:existing})};
 const save=async form=>{calls.push(form);return {ok:true,message:'Saved'};};
 const context={body,permissions,feature:'account-categories',uuid:value=>value==='category',RequestError:Error,db:{from:()=>query},business:{id:'business'},scope:{branchId:'branch'},FormData,response:(data,status)=>({data,status}),createCategory:save,updateCategory:save,deleteCategoryById:async id=>{calls.push(id);return {ok:true};}};
 const result=await new Function(...Object.keys(context),'return (async()=>{'+js+'})()')(...Object.values(context));return {calls,result};
}
test('category creation uses current branch and existing edits preserve display branches',async()=>{
 const body={action:'create',name:'Shoes',description:'',isOnline:true};
 const created=await run(body);assert.deepEqual(created.calls[0].getAll('branchIds'),['branch']);
 const edited=await run({...body,action:'edit',id:'category'},{id:'category',branch_ids:['branch','second'],online_sort_order:4});
 assert.deepEqual(edited.calls[0].getAll('branchIds'),['branch','second']);assert.equal(edited.calls[0].get('index'),'4');
});
test('category writes reject absent permissions and another branch before mutation',async()=>{
 await assert.rejects(()=>run({action:'create'},null,[]),/cannot manage/);
 await assert.rejects(()=>run({action:'delete',id:'category'},{id:'category',branch_ids:['other']}),/unavailable in this branch/);
 await assert.rejects(()=>run({action:'create',name:'a',description:'',isOnline:true}),/2–50/);
});
