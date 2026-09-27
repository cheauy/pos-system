const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');
function source(file,name){
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);
 assert.ok(found,name);return ts.transpileModule(found,{compilerOptions:{target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText;
}
test('purchase, transfer and bundle selectors show variants inside one screen and retain exact product IDs',()=>{
 const rows=[{id:'small',name:'Tee',variant_group_id:'tee',size:'S',color:'Blue',cost_price:5},{id:'large',name:'Tee',variant_group_id:'tee',size:'L',color:'Blue',cost_price:6}];
 for(const operation of ['purchase-create','transfer-save','bundle-create']){
  let cursor=0;const states=[],paths=[],selected=[];
  const jsx=(type,props,...children)=>({type,props:{...props,children}});
  const dependencies={React:{createElement:jsx,Fragment:'Fragment'},useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useEffect:()=>{},useTheme:()=>({text:'black',panel:'white',border:'grey'}),useData:path=>{paths.push(path);return {data:{rows,total:1,currency:'USD'},loading:false,refresh:()=>{}};},...loadTs('mobile/src/product-groups.ts'),...loadTs('mobile/src/variant-selection.ts'),money:String,styles:{row:{},page:{}},api:()=>assert.fail('ordinary variants need no detail request')};
  for(const name of ['SafeAreaView','ScrollView','View','Label','ProductPhoto','ChoiceChip','Button','Field','Card','Shimmer','ActivityIndicator','Pressable','Pagination'])dependencies[name]=name;
  const component=new Function(...Object.keys(dependencies),`${source('mobile/src/management.tsx','ProductChooser')};return ProductChooser;`)(...Object.values(dependencies));
  function render(){cursor=0;return component({operation,visible:true,scope:{},online:true,selected:[],configure:operation==='bundle-create',choose:p=>selected.push(p.id),close:()=>{}});}
  function nodes(tree){return tree&&typeof tree==='object'?[tree,...(tree.props?.children||[]).flat(Infinity).flatMap(nodes)]:[];}
  let tree=render();assert.equal(nodes(tree).some(node=>node.type==='Modal'),false,'selector must share the form Modal');
  nodes(tree).find(node=>node.type==='Pressable').props.onPress();
  tree=render();nodes(tree).find(node=>node.type==='ChoiceChip'&&node.props.title==='Blue').props.onPress();
  tree=render();nodes(tree).find(node=>node.type==='ChoiceChip'&&node.props.title==='L').props.onPress();
  tree=render();const add=nodes(tree).find(node=>node.type==='Button'&&node.props.title==='Add item');assert.equal(add.props.disabled,false);add.props.onPress();
  assert.deepEqual(selected,['large']);assert.ok(paths[0].startsWith(operation==='purchase-create'?'purchase-products?':operation==='transfer-save'?'transfer-products?':'catalog?'));
 }
});
test('appearance is applied only after persistence succeeds; failed saving retains the previous theme',async()=>{
 const code=source('mobile/App.tsx','appearance'),events=[];
 const save=new Function('deviceStorage','setDark','setLanguage',`${code};return appearance;`)({setItem:async(key,value)=>{events.push(['saved',key,JSON.parse(value)]);}},value=>events.push(['dark',value]),value=>events.push(['language',value]));
 await save(true,'km');assert.deepEqual(events.map(event=>event[0]),['saved','dark','language']);assert.deepEqual(events[0][2],{dark:true,language:'km'});
 const failed=new Function('deviceStorage','setDark','setLanguage',`${code};return appearance;`)({setItem:async()=>{throw Error('storage unavailable');}},()=>assert.fail('must not apply'),()=>assert.fail('must not apply'));
 await assert.rejects(()=>failed(true,'km'),/storage unavailable/);
});
