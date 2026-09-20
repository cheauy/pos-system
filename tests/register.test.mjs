import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});const m={exports:{}};new Function('require','module','exports',outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id];},m,m.exports);return m.exports;}
const model=load('../app/(dashboard)/dashboard/register/register-model.ts');
const shift={id:'shift',opening_cash:100};
const order={id:'sale',register_shift_id:'shift',status:'completed',total:50,amount_paid:60,change_amount:10,payment_method:'cod',pos_checkout:null};
test('cash payment excludes change and non-cash is not counted twice',()=>{assert.deepEqual(model.payments(order),{cash:5000,noncash:0});assert.deepEqual(model.payments({...order,pos_checkout:{tenders:[{method:'cash',amount:40},{method:'bank_transfer',amount:20}]}}),{cash:3000,noncash:2000});});
test('branch shift totals include only its orders and movements',()=>{const summary=model.totals(shift,[{shift_id:'shift',movement_type:'cash_in',amount:20},{shift_id:'shift',movement_type:'cash_out',amount:5},{shift_id:'other',movement_type:'cash_in',amount:900}],[order,{...order,register_shift_id:'other'}]);assert.equal(summary.expected,165);assert.equal(summary.noncash,0);});
test('cash inputs reject blank, negative, non-finite, fractional cents; counted zero is valid',()=>{for(const v of ['', '-1','NaN','Infinity','0.001'])assert.equal(model.validCash(v),false);assert.equal(model.validCash('0'),true);assert.equal(model.validCash('0',true),false);});
function actions(status='open'){
 const calls=[];const filters=[];const db={from:()=>({select:()=>({eq(k,v){filters.push([k,v]);return this;},maybeSingle:async()=>({data:status?{id:'shift',status}:null,error:null})})}),rpc:async(name,args)=>{calls.push({name,args});return{data:{expected_cash:12,variance:0},error:null};}};
 const api=load('../app/(dashboard)/dashboard/register/actions.ts',{'./register-model':model,'@/lib/subscriptions/branch-limits':{assertBranchOperation:async()=>{}},'next/cache':{revalidatePath(){}},'@/lib/audit/create-audit-log':{createAuditLog:async()=>{}},'@/lib/auth/require-permission':{requirePermission:async p=>{assert.equal(p,'register.manage');return{id:'business'};}},'@/lib/supabase/branch-server':{createClient:async()=>db}});return{api,calls,filters};
}
function data(values){const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,v);return f;}
test('close verifies business shift and sends only counted cash to server calculation',async()=>{const {api,calls,filters}=actions();await api.closeRegisterShift(data({shiftId:'shift',closingCash:'12',expectedCash:'999999'}));assert.deepEqual(filters,[['business_id','business'],['id','shift']]);assert.equal(calls[0].args.p_closing_cash,12);assert.equal('p_expected_cash' in calls[0].args,false);});
test('closed or foreign shifts cannot receive movements or be closed again',async()=>{for(const status of ['closed',null]){const {api,calls}=actions(status);await assert.rejects(api.closeRegisterShift(data({shiftId:'shift',closingCash:'0'})));await assert.rejects(api.addCashMovement(data({shiftId:'shift',type:'cash_out',amount:'2',reason:'Safe drop'})));assert.equal(calls.length,0);}});

test('paid pickup and delivery orders count before fulfillment completes',()=>{for(const status of ['new','pending','completed','refunded']){const o={...order,status,pos_checkout:{cashReceived:50,receipt:{amountPaid:60,change:10}}};assert.equal(model.totals(shift,[],[o]).expected,150);}});
test('a refund is subtracted once from the paying drawer, not the original sale twice',()=>{const o={...order,status:'refunded',pos_checkout:{cashReceived:50,receipt:{amountPaid:60,change:10}}};const t=model.totals(shift,[{shift_id:'shift',movement_type:'cash_out',amount:10,reference:'return:id'}],[o]);assert.equal(t.expected,140);assert.equal(t.refunds,10);});
test('closed register uses saved summary when order state changes later',()=>{const snapshot={cash:50,noncash:0,incoming:0,outgoing:0,refunds:0,expected:150};assert.deepEqual(model.totals({...shift,status:'closed',register_summary:snapshot},[],[]),snapshot);});
