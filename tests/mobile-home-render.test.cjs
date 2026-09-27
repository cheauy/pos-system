const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');

test('Home analytics render no bare text while loading, empty, populated or failed',()=>{
 const file='mobile/src/screens.tsx',ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true,4);
 const node=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='DashboardCharts');
 const code=ts.transpileModule(node.getText(ast),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 const report={from:'2026-09-26',to:'2026-09-26',revenue:0,netProfit:0,orders:0,expenses:0,currency:'USD',days:[],products:[],sources:[],payments:[]};
 for(const state of [{loading:true},{loading:false},{error:'Connection interrupted'},{data:report},{data:{...report,days:[{date:'2026-09-26',value:10}],products:[{name:'Shirt',quantity:1}]}}]){
  const deps={React:{Fragment:'Fragment',createElement:(type,props,...children)=>({type,props,children})},useState:()=>['yesterday',()=>{}],useData:()=>({...state,refresh(){}}),money:String};
  for(const name of ['SectionTitle','SelectMenu','Card','Label','Button','Shimmer','View','Metric','SalesChart','Ranking','Donut'])deps[name]=name;
  const render=new Function(...Object.keys(deps),`${code};return DashboardCharts;`)(...Object.values(deps));
  function check(node,inText=false){
   if(node===null||node===undefined||typeof node==='boolean')return;
   if(Array.isArray(node)){node.forEach(child=>check(child,inText));return;}
   if(typeof node==='string'||typeof node==='number'){assert.ok(inText,`Bare native text: ${JSON.stringify(node)}`);return;}
   (node.children??[]).forEach(child=>check(child,inText||node.type==='Label'));
  }
  check(render({scope:{},online:true}));
 }
});

test('mobile shell has no accidental one-line spaces between native elements',()=>{
 const file='mobile/App.tsx',ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true,4);
 function visit(node){
  if(ts.isJsxText(node)&&node.text.length&&!node.text.trim()&&!/[\r\n]/.test(node.text))assert.fail(`Bare space in app header at line ${ast.getLineAndCharacterOfPosition(node.pos).line+1}`);
  ts.forEachChild(node,visit);
 }
 visit(ast);
});
