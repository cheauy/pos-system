const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file=ts.createSourceFile('sidebar.tsx',fs.readFileSync('app/(dashboard)/dashboard/sidebar-client.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let sidebar;for(const node of file.statements)if(ts.isFunctionDeclaration(node)&&node.name?.text==='SidebarClient')sidebar=node;
const effect=sidebar.body.statements.filter(ts.isExpressionStatement).map(node=>node.expression).find(node=>ts.isCallExpression(node)&&node.expression.getText(file)==='useEffect'&&node.arguments[0].getText(file).includes('showModal'));
const source=ts.transpileModule(`const effect=${effect.arguments[0].getText(file)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('mobile navigation locks scrolling, closes at tablet/desktop width, and restores focus and original scrolling',()=>{
 const events=[];let listener;
 const document={body:{style:{overflow:'auto'}},activeElement:{focus:()=>events.push('focus')}};
 const media={matches:false,addEventListener:(_,fn)=>listener=fn,removeEventListener:(_,fn)=>assert.equal(fn,listener)};
 const context={isMobileOpen:true,document,window:{matchMedia:value=>{assert.equal(value,'(min-width: 768px)');return media;}},drawer:{current:{showModal:()=>events.push('open'),close:()=>events.push('close')}},setIsMobileOpen:value=>events.push(value)};
 const run=new Function(...Object.keys(context),source+';return effect;')(...Object.values(context));
 const cleanup=run();assert.equal(document.body.style.overflow,'hidden');listener();assert.deepEqual(events,['open']);
 media.matches=true;listener();assert.deepEqual(events,['open',false]);cleanup();
 assert.equal(document.body.style.overflow,'auto');assert.deepEqual(events,['open',false,'close','focus']);
});
