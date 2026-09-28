const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
test('mobile screens contain no raw text or single-line spaces outside text components',()=>{
 for(const file of ['mobile/App.tsx',...fs.readdirSync('mobile/src').filter(name=>name.endsWith('.tsx')).map(name=>'mobile/src/'+name)]){
  const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true,4);
  function visit(node){
   if(ts.isJsxText(node)&&node.text.length){const tag=node.parent.openingElement?.tagName?.getText(ast);if(!['Text','Label','SvgText'].includes(tag))assert.ok(!node.text.trim()&&/[\r\n]/.test(node.text),`${file}:${ast.getLineAndCharacterOfPosition(node.pos).line+1} has raw native text ${JSON.stringify(node.text)}`);}
   ts.forEachChild(node,visit);
  }visit(ast);
 }
});
test('customer selector searches formatted phones, selects exact records, and loads ten at a time',()=>{
 const ast=ts.createSourceFile('selector.tsx',fs.readFileSync('mobile/src/customer-selector.tsx','utf8'),99,true,4);
 const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='CustomerSelector');
 const js=ts.transpileModule(fn.getText(ast).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const state=[];let cursor=0,selected;
 const deps={React:{createElement:(type,props,...children)=>({type,props:props||{},children})},useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useEffect:()=>{},useTheme:()=>({t:value=>value,text:'black',background:'white',panel:'white',border:'grey',muted:'grey',language:'en'}),colours:['blue'],styles:{row:{}}};
 for(const name of ['Modal','SafeAreaView','FlatList','View','Pressable','Text','Label','SearchField','Shimmer','Ionicons'])deps[name]=name;
 const renderComponent=new Function(...Object.keys(deps),js+';return CustomerSelector;')(...Object.values(deps));
 const customers=Array.from({length:23},(_,i)=>({id:String(i),name:`Customer ${i}`,phone:i===0?'010 312 400':`123-${i}`,address:'Shop street'}));
 function render(allowWalkIn=true){cursor=0;return renderComponent({customers,selectedId:'',allowWalkIn,close(){},select:customer=>selected=customer});}
 function nodes(tree){return !tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...tree.children.flatMap(nodes)];}
 let tree=render(),list=nodes(tree).find(n=>n.type==='FlatList');assert.equal(list.props.data.length,10);
 list.props.onEndReached();list=nodes(render()).find(n=>n.type==='FlatList');assert.equal(list.props.data.length,20);
 list.props.renderItem({item:customers[2]}).props.onPress();assert.equal(selected,customers[2]);
 const walkIn=nodes(list.props.ListHeaderComponent).find(n=>n.props.accessibilityLabel==='Walk-in customer');walkIn.props.onPress();assert.equal(selected,null);
 const deliveryList=nodes(render(false)).find(n=>n.type==='FlatList');assert.equal(nodes(deliveryList.props.ListHeaderComponent).some(n=>n.props.accessibilityLabel==='Walk-in customer'),false);
 nodes(tree).find(n=>n.type==='SearchField').props.onChangeText('010312400');
 list=nodes(render()).find(n=>n.type==='FlatList');assert.deepEqual(list.props.data.map(row=>row.id),['0']);
 function check(node,inText=false){if(node==null||typeof node==='boolean')return;if(Array.isArray(node)){node.forEach(child=>check(child,inText));return;}if(typeof node==='string'||typeof node==='number'){assert.ok(inText,`Bare native text ${JSON.stringify(node)}`);return;}node.children.forEach(child=>check(child,inText||['Text','Label'].includes(node.type)));}
 check(render());check(list.props.ListHeaderComponent);check(list.props.renderItem({item:customers[0]}));
});
