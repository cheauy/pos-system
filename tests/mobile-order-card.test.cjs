const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
test('order cards keep customer first, order ID second, and readable status labels',()=>{
 const source=ts.createSourceFile('card.tsx',fs.readFileSync('mobile/src/order-card.tsx','utf8'),99,true,4);
 const node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='OrderCard');
 const code=ts.transpileModule(node.getText(source).replace('export ',''),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 const deps={React:{createElement:(type,props,...children)=>({type,props,children})},Pressable:'Pressable',Text:'Text',View:'View',Ionicons:'Icon',Badge:'Badge',ProductPhoto:'Photo',money:n=>String(n),useTheme:()=>({t:s=>s})};
 const render=new Function(...Object.keys(deps),code+';return OrderCard;')(...Object.values(deps));
 for(const grid of [false,true]){
  let opened=false;
  const result=render({order:{id:'1',orderNumber:'POS-123',customerName:'Sok',paymentState:'paid',status:'completed',total:12},grid,open:()=>{opened=true;}});
  const text=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}if(n.type==='Text')text.push(n.children.join(''));if(n.type==='Badge')assert.equal(n.props.title,'Completed');n.children.forEach(visit);}visit(result);
  assert.deepEqual(text.slice(0,3),['Sok','POS-123','Paid']);assert.equal(result.children[0].type,'Photo');
  result.props.onPress();assert.equal(opened,true);
 }
});
