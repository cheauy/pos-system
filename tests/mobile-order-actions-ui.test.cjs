const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');
const element=(type,props)=>({type,props});
function nodes(value){if(value==null)return [];if(Array.isArray(value))return value.flatMap(nodes);if(typeof value!=='object')return [];return [value,...nodes(value.props?.children)];}
function render(status,canUpdate=true,incoming=false){
 const alerts=[],calls=[];
 const {OrderSheet}=loadTs('mobile/src/order-detail.tsx',{
  react:{useState:value=>[value,()=>{}],useRef:value=>({current:value})},
  'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'Fragment'},
  'react-native':Object.fromEntries(['Modal','Pressable','ScrollView','Text','View'].map(v=>[v,v])),
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
  '@expo/vector-icons':{Ionicons:'Icon'},'expo-image':{Image:'Image'},
  './client':{api:async(...args)=>calls.push(args),money:v=>String(v)},
  './ui':{...Object.fromEntries(['ActionArea','Badge','Button','Card','DetailRow','Field','Label','ProductPhoto','SectionTitle'].map(v=>[v,v])),styles:{},useTheme:()=>({t:v=>v,alert:(...v)=>alerts.push(v)})},
  './data':{useData:()=>({data:{id:'1',orderNumber:'POS-1',status,paymentState:'paid',source:'pos',total:15,createdAt:'2026-09-28',updatedAt:'2026-09-28',items:[]},refresh(){}}),invalidateCache(){}},
  './loading':{Shimmer:'Shimmer'},'./return-order':{ReturnOrder:'ReturnOrder'},'./order-document':{},
 });
 return {tree:nodes(OrderSheet({id:'1',scope:{},online:true,onClose(){},canUpdate,canReturn:true,currency:'USD',incoming})),alerts,calls};
}
test('floating button advances one status without changing payment',()=>{
 for(const [status,title,next] of [['new','Confirmed','pending'],['pending','In Progress','in_progress'],['in_progress','Complete','completed']]){
  const r=render(status);
  r.tree.find(n=>n.props?.title===title).props.onPress();
  assert.equal(r.alerts.length,0);
  assert.equal(r.calls[0][2].status,next);
  assert.equal(r.calls[0][2].updatedAt,'2026-09-28');
  assert.equal(r.calls.length,1);
 }
 for(const status of ['completed','cancelled','refunded'])assert.ok(!render(status).tree.some(n=>['Confirmed','In Progress','Complete'].includes(n.props?.title)));
 assert.ok(!render('new',false).tree.some(n=>n.props?.title==='Confirmed'));
 const incoming=render('new',true,true);incoming.tree.find(n=>n.props?.title==='Confirmed').props.onPress();
 assert.equal(incoming.calls[0][0],'incoming-status');assert.equal(incoming.calls[0][2].status,'accepted');
});
test('one Print action offers receipt and label; sharing remains separate',()=>{
 const r=render('completed');r.tree.find(n=>n.props?.accessibilityLabel==='Print').props.onPress();
 assert.deepEqual(r.alerts[0][2].map(v=>v.text),['Receipt','Label','Cancel']);
 assert.ok(r.tree.some(n=>n.props?.accessibilityLabel==='Share PDF receipt'));
 assert.ok(r.tree.some(n=>n.props?.accessibilityLabel==='Edit order'));
 assert.ok(!r.tree.some(n=>n.props?.title==='Print shipping label'));
});
test('POS back unlocks only after the current draft is saved and no transaction is unresolved',()=>{
 const source=ts.createSourceFile('pos.tsx',fs.readFileSync('mobile/src/pos.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let expression;function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='onLocked')expression=node.arguments[0].getText(source);ts.forEachChild(node,visit);}visit(source);
 const locked=new Function('pending','pendingHold','busy','storageReady','savedDraftRevision','draftRevision','return '+expression);
 assert.equal(locked(null,null,false,true,'cart-with-items','cart-with-items'),false);
 assert.equal(locked(null,null,false,true,'old-cart','new-cart'),true);
 assert.equal(locked({},null,false,true,'cart','cart'),true);
 assert.equal(locked(null,{},false,true,'cart','cart'),true);
 assert.equal(locked(null,null,true,true,'cart','cart'),true);
 assert.equal(locked(null,null,false,false,'cart','cart'),true);
});
test('return quantity rejects fractions and excess; summary uses selected quantities and refund remains disabled before completion',()=>{
 const order={orderNumber:'POS-1',status:'completed',items:[{id:'item',name:'Shirt',variant:'White / M',quantity:3,returnedQuantity:1,unitPrice:15,imageUrl:'photo'}]};
 let index=0,states=[order,null,true,false,'','Incorrect Size or Fit','','cash',{},false],updates=[];
 const {ReturnOrder}=loadTs('mobile/src/return-order.tsx',{
  react:{useEffect(){},useRef:v=>({current:v}),useState:v=>{const i=index++;return [states[i]??v,value=>updates.push([i,value])];}},
  'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'Fragment'},
  'react-native':Object.fromEntries(['ActivityIndicator','Modal','Pressable','ScrollView','Text','View'].map(v=>[v,v])),
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@expo/vector-icons':{Ionicons:'Icon'},
  'expo-crypto':{},'./client':{money:v=>String(v)},
  './ui':{...Object.fromEntries(['Button','Card','DetailRow','Field','Label','ProductPhoto','SectionTitle'].map(v=>[v,v])),styles:{},useTheme:()=>({t:v=>v})}
 });
 const render=()=>{index=0;return nodes(ReturnOrder({id:'1',scope:{},online:true,currency:'USD',close(){},saved(){}}));};
 let tree=render(),field=tree.find(n=>n.props?.label==='Return quantity');
 for(const value of ['3','1.5','-1','abc'])field.props.onChangeText(value);
 assert.equal(updates.length,0);
 field.props.onChangeText('2');assert.equal(updates.length,1);
 states[8]=updates[0][1]({});tree=render();
 assert.equal(tree.find(n=>n.props?.label==='Estimated refund').props.value,'30');
 assert.equal(tree.find(n=>n.props?.title==='Review return').props.disabled,false);
 order.status='pending';assert.equal(render().find(n=>n.props?.title==='Review return').props.disabled,true);
});
test('order grid uses content height and square photos like Stock, without stretching details',()=>{
 const {OrderCard}=loadTs('mobile/src/order-card.tsx',{
  react:{},'react/jsx-runtime':{jsx:element,jsxs:element},
  'react-native':{Pressable:'Pressable',Text:'Text',View:'View'},
  '@expo/vector-icons':{Ionicons:'Icon'},'./client':{money:v=>String(v)},
  './ui':{Badge:'Badge',ProductPhoto:'ProductPhoto',useTheme:()=>({t:v=>v})},
 });
 for(const grid of [true,false]){
  const card=OrderCard({order:{id:'1',customerName:'Customer',orderNumber:'POS-1',total:15,status:'completed',paymentState:'paid'},grid,open(){}});
  const style=card.props.style({pressed:false});
  assert.equal(style.height,undefined);
  assert.equal(style.gap,grid?8:10);
  assert.equal(card.props.children[0].props.fill,grid);
  assert.equal(card.props.children[1].props.style.flex,grid?undefined:1);
  assert.ok(nodes(card).some(n=>n.type==='Badge'&&n.props.title==='Completed'));
 }
});
