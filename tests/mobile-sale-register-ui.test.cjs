const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');

test('closing cash preview uses cents and requires an actual count',()=>{
  const {closingVariance}=loadTs('mobile/src/register-closing.tsx',{
    react:{},'react/jsx-runtime':{},'react-native':{},'./ui':{},'./client':{},'./decimal-input':{},'./loading':{},
  });
  assert.equal(closingVariance('20.10',20.20),-0.10);
  assert.equal(closingVariance('50',50),0);
  assert.equal(closingVariance('0',20),-20);
  assert.equal(closingVariance('20.50',20),0.5);
  for(const value of ['', '-1','1.234','abc'])assert.equal(closingVariance(value,20),null);
  assert.equal(closingVariance('20',NaN),null);
});

test('quick size run sits after product photo and directly before variant editor',()=>{
  const source=fs.readFileSync('mobile/src/management.tsx','utf8');
  const quick=source.indexOf('title="Quick size run"'),photo=source.indexOf('title="Product photo"'),variants=source.indexOf("<Label>{values.type==='variant'?'Variants'");
  assert.ok(photo<quick&&quick<variants);
  assert.ok(source.includes("isProduct?'Save product'"));
});

test('sale summary uses confirmed amounts and distinguishes payment due; printing is explicit',()=>{
  const element=(type,props)=>({type,props});
  const native=Object.fromEntries(['View','Text','Pressable'].map(key=>[key,key]));
  const ui=Object.fromEntries(['Button','Card','DetailRow','Label','ProductPhoto'].map(key=>[key,key]));
  const {SaleCompleted}=loadTs('mobile/src/sale-completed.tsx',{
    react:{useState:()=>[false,()=>{}]},'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'Fragment'},
    'react-native':native,'@expo/vector-icons':{Ionicons:'Icon'},'./client':{money:(v,c)=>`${c} ${v.toFixed(2)}`},
    './data':{},'./ui':{...ui,styles:{row:{}},useTheme:()=>({t:v=>v})},'./order-detail':{OrderSheet:'OrderSheet'},
  });
  let printed=0,next=0;
  const props={receipt:{orderId:'saved-id',orderNumber:'POS-SAVED',total:17,currency:'USD',change:3,remaining:0,shipping:{method:'pickup'},tenders:[{method:'cash',amount:20}]},scope:{},online:true,busy:false,permissions:['orders.view'],print:()=>printed++,next:()=>next++};
  function nodes(value){if(value==null)return [];if(Array.isArray(value))return value.flatMap(nodes);if(typeof value!=='object')return [value];return [value,...nodes(value.props?.children)];}
  const tree=nodes(SaleCompleted(props));
  assert.ok(tree.includes('Sale completed'));assert.ok(tree.includes('POS-SAVED'));assert.ok(tree.includes('USD 17.00'));assert.ok(tree.includes('USD 3.00'));assert.ok(tree.includes('Pickup'));
  assert.equal(printed,0);tree.find(node=>node?.props?.title==='Next sale').props.onPress();assert.equal(next,1);
  assert.ok(!tree.includes('Back to POS'));
  const due=nodes(SaleCompleted({...props,receipt:{...props.receipt,remaining:12}}));
  assert.ok(due.includes('Order recorded'));assert.ok(due.includes('Payment due'));assert.ok(due.includes('USD 12.00'));assert.ok(!due.includes('Sale completed'));
});

test('opening register rejects invalid cash and already-open branches before any write',async()=>{
  const source=ts.createSourceFile('entry-form.tsx',fs.readFileSync('mobile/src/entry-form.tsx','utf8'),ts.ScriptTarget.Latest,ts.ScriptKind.TSX);
  const form=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='EntryForm');
  const submit=form.body.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='submit');
  const js=ts.transpileModule(submit.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  let writes=0,error='';const values={openingCash:'-1'};
  const context={kind:'register-open',scope:{branchId:'branch'},registerContext:{hasOpen:false},working:{current:false},online:true,values,shiftId:undefined,
    setBusy(){},setError:v=>error=v,setNotice(){},setProgress(){},setAttempted(){},saved(){},api:async()=>writes++};
  const run=new Function(...Object.keys(context),`${js};return submit`)(...Object.values(context));
  for(const value of ['','-1','1.234','no','Infinity']){values.openingCash=value;await run();assert.match(error,/valid opening cash/);}
  assert.equal(writes,0);values.openingCash='20.50';await run();assert.equal(writes,1);
  context.registerContext.hasOpen=true;await run();assert.equal(writes,1);assert.match(error,/no open shift/);
});
