const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const path='components/scanned-order-complete.tsx';
const file=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let fn;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='complete')fn=node;ts.forEachChild(node,visit);}visit(file);
const source=ts.transpileModule(fn.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('scanned completion retains business/version guard, prevents double submit, reports rejected updates',async()=>{
 for(const success of [true,false]){
  const events=[];let finish;const pending=new Promise(resolve=>finish=resolve);
  const context={id:'order',updatedAt:'version',businessId:'business',working:{current:false},setBusy:v=>events.push(['busy',v]),setError:v=>events.push(['error',v]),setDone:v=>events.push(['done',v]),setConfirm:()=>{},toast:{success:()=>events.push(['toast'])},router:{refresh:()=>events.push(['refresh'])},changeOrderWorkspaceStatus:async(...args)=>{assert.deepEqual(args,['order','version','completed','','business']);events.push(['save']);await pending;return{success,message:'Order changed. Refresh first.'};}};
  const complete=new Function(...Object.keys(context),source+';return complete;')(...Object.values(context));
  const first=complete();await complete();assert.equal(events.filter(e=>e[0]==='save').length,1);finish();await first;
  assert.equal(events.some(e=>e[0]==='done'),success);assert.equal(events.some(e=>e[0]==='toast'),success);
  if(!success)assert.ok(events.some(e=>e[0]==='error'&&e[1]==='Order changed. Refresh first.'));
  assert.equal(context.working.current,false);
 }
});
