const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file=ts.createSourceFile('pos-client.tsx',fs.readFileSync('app/(dashboard)/dashboard/pos/pos-client.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let fn;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='beginCheckout')fn=node;ts.forEachChild(node,visit)}visit(file);
const source=ts.transpileModule(fn.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('checkout review is immediate, never submits a sale, and retains local safety gates',()=>{
 const events=[];
 const context={inFlight:{current:false},frozen:false,recoveryLoaded:true,lines:[{}],issue:null,
  data:{checkoutVersion:3,settings:{requireOpenRegister:true,taxRate:0,pointValue:0},shift:{location_id:'branch'},customers:[]},branch:'branch',
  cartIssue:()=>null,totals:()=>({total:30}),discount:'0',delivery:'0',points:'0',discountType:'amount',customerId:'',recipientEdited:{current:false},
  changePayment:()=>events.push('split'),setShipping:()=>{},setEntryErrors:()=>{},setConfirmed:()=>{},open:name=>events.push(name),
  setNotice:notice=>events.push(notice.text),messageOf:error=>error.message,
  loadPosWorkspace:()=>{throw Error('Review must not reload the full workspace')},completePosSale:()=>{throw Error('Review must not submit')},
 };
 const run=()=>new Function(...Object.keys(context),source+';return beginCheckout;')(...Object.values(context))();
 assert.equal(run(),undefined);assert.deepEqual(events,['checkout']);events.length=0;
 context.data.shift=null;run();assert.match(events[0],/Open the register/);events.length=0;
 context.data.settings.requireOpenRegister=false;run();assert.deepEqual(events,['checkout']);events.length=0;
 context.frozen=true;run();assert.deepEqual(events,[]);
});
