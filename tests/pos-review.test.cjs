const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file=ts.createSourceFile('pos-client.tsx',fs.readFileSync('app/(dashboard)/dashboard/pos/pos-client.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let fn;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='beginCheckout')fn=node;ts.forEachChild(node,visit)}visit(file);
const source=ts.transpileModule(fn.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('checkout review is immediate, never submits a sale, and retains local safety gates',()=>{
 const events=[];
 const context={inFlight:{current:false},frozen:false,recoveryLoaded:true,lines:[{}],issue:null,
  data:{checkoutVersion:3,settings:{requireOpenRegister:true,taxRate:0,pointValue:0},shift:{location_id:'branch'},customers:[]},branch:'branch',
  cartIssue:()=>null,totals:()=>({total:30}),discount:'0',delivery:'0',points:'0',discountType:'amount',customerId:'',shipping:{method:'in_store'},recipientEdited:{current:false},
  setChoosingCustomer(){},changePayment:()=>events.push('split'),setShipping:()=>{},setEntryErrors:()=>{},setConfirmed:()=>{},open:name=>events.push(name),
  setNotice:notice=>events.push(notice.text),messageOf:error=>error.message,
  loadPosWorkspace:()=>{throw Error('Review must not reload the full workspace')},completePosSale:()=>{throw Error('Review must not submit')},
 };
 const run=()=>new Function(...Object.keys(context),source+';return beginCheckout;')(...Object.values(context))();
 assert.equal(run(),undefined);assert.deepEqual(events,['checkout']);events.length=0;
 context.data.shift=null;run();assert.match(events[0],/Open the register/);events.length=0;
 context.data.settings.requireOpenRegister=false;run();assert.deepEqual(events,['checkout']);events.length=0;
 context.shipping.method='pickup';run();assert.deepEqual(events,['checkout']);events.length=0;
 context.customerId='customer';run();assert.deepEqual(events,['checkout']);events.length=0;
 context.frozen=true;run();assert.deepEqual(events,[]);
});

test('selecting a saved customer preserves Pickup and Delivery',()=>{
 let select;function find(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='selectPickerCustomer')select=n;ts.forEachChild(n,find)}find(file);
 const code=ts.transpileModule(select.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const method of ['in_store','pickup','delivery']){
   let shipping={method},payment,selected;
   const context={shipping,upsertWorkspaceCustomer(){},setCustomerId:id=>selected=id,setPoints(){},setCreateCustomer(){},recipientEdited:{current:true},setShipping:fn=>shipping=fn(shipping),setMethod:value=>payment=value,setTenders(){},setPaid(){},setEntryErrors(){},setDialog(){throw Error("Selecting a customer must keep checkout open")},setChoosingCustomer(){},setModalError(){},setConfirmed(){}};
   new Function(...Object.keys(context),code+';return selectPickerCustomer;')(...Object.values(context))({id:'customer',name:'Buyer',phone:'012345678',address:'Street 1'});
   assert.equal(shipping.method,method);assert.equal(shipping.recipientName,method==='in_store'?'':'Buyer');assert.equal(selected,'customer');assert.equal(payment,method==='delivery'?'cod':'cash');
 }
});

test('selecting Pickup or Delivery closes the type dialog without fetching customers',()=>{
 let select;function find(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='selectPickup')select=n;ts.forEachChild(n,find)}find(file);
 const code=ts.transpileModule(select.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const method of ['pickup','delivery']){
   let shipping,dialog='customer';
   const context={frozen:false,shipping:{method:'in_store',recipientName:'',phone:'',address:''},customerId:'',setCustomerId(){},setPoints(){},setCreateCustomer(){},recipientEdited:{current:false},setShipping:value=>shipping=value,setDelivery(){},setMethod(){},setPaid(){},setTenders(){},setConfirmed(){},setEntryErrors(){},setDialog:value=>dialog=value,setChoosingCustomer(){},setModalError(){}};
   new Function(...Object.keys(context),code+';return selectPickup;')(...Object.values(context))(method);
   assert.equal(shipping.method,method);assert.equal(dialog,null);
 }
});

test('typed Pickup/Delivery customer details survive reopening or switching type; a saved customer is cleared',()=>{
 let select;function find(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='selectPickup')select=n;ts.forEachChild(n,find)}find(file);
 const code=ts.transpileModule(select.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const run=(current,customerId,method)=>{let shipping;const context={frozen:false,shipping:current,customerId,setCustomerId(){},setPoints(){},setCreateCustomer(){},recipientEdited:{current:true},setShipping:value=>shipping=value,setDelivery(){},setMethod(){},setPaid(){},setTenders(){},setConfirmed(){},setEntryErrors(){},setDialog(){},setChoosingCustomer(){},setModalError(){}};new Function(...Object.keys(context),code+';return selectPickup;')(...Object.values(context))(method);return shipping;};
 const typed={method:'pickup',recipientName:'New Buyer',phone:'012 345 678',address:'',carrier:'',carrierOther:''};
 assert.equal(run(typed,'','pickup').recipientName,'New Buyer');
 const delivery=run(typed,'','delivery');assert.equal(delivery.method,'delivery');assert.equal(delivery.phone,'012 345 678');
 assert.equal(run(typed,'saved-customer','delivery').recipientName,'');
 assert.equal(run({method:'in_store',recipientName:'',phone:'',address:''},'','pickup').recipientName,'');
});

test('Pickup/Delivery checkout creates or links the customer inside the sale request, never before it',()=>{
 const src=file.getFullText();
 assert.match(src,/createCustomer:!linkedCustomerId && shipping\.method !== 'in_store'/);
 assert.match(src,/findPosCustomerByPhone\(data\.businessId, shipping\.phone, branch\)/);
 assert.doesNotMatch(src,/Select a customer for this order\./);
 const picker=fs.readFileSync('app/(dashboard)/dashboard/pos/pos-customer-picker.tsx','utf8');
 const draftForm=picker.slice(picker.indexOf('if(showForm && p.draft)'),picker.indexOf('if(showForm)return'));
 assert.ok(draftForm.length>0);assert.doesNotMatch(draftForm,/createPosCustomer|Save customer|sessionStorage/);
});
