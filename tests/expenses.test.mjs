import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});const m={exports:{}};new Function('require','module','exports',outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id];},m,m.exports);return m.exports;}
const model=load('../app/(dashboard)/dashboard/expenses/expense-model.ts');
function setup(rejectBranch=false){const writes=[];const checks=[];const api=load('../app/(dashboard)/dashboard/expenses/actions.ts',{'node:crypto':{randomUUID:()=> 'expense-id'},'@/lib/expenses/receipts':{uploadExpenseReceipt:async()=>{},removeExpenseReceipt:async()=>{}},'./expense-model':model,'@/lib/subscriptions/branch-limits':{assertBranchOperation:async(...args)=>{checks.push(args);if(rejectBranch)throw Error('Choose an active branch in this business.');}},'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('redirect');}},'@/lib/auth/require-permission':{requirePermission:async p=>{assert.equal(p,'expenses.manage');return{id:'business-1'};}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'user-1'}}})},from:table=>{assert.equal(table,'expenses');return{insert:async row=>{writes.push(row);return{error:null};}}}})},'@/lib/audit/create-audit-log':{createAuditLog:async()=>{}}});return{api,writes,checks};}
function form(){const data=new FormData();Object.entries({category:'Rent',description:'Shop rent',expenseDate:'2026-09-20',amount:'20.50',locationId:'branch-1',paymentMethod:'cash'}).forEach(([k,v])=>data.set(k,v));return data;}
test('18 categories and legacy names combine accurately without changing old records',()=>{assert.equal(model.CATEGORIES.length,18);const rows=[{category:'Salary',amount:'0.10'},{category:'Staff / Payroll',amount:'0.20'}];assert.equal(model.sum(rows),0.3);assert.deepEqual(model.categoryTotals(rows).map(({name,value})=>({name,value})),[{name:'Staff / Payroll',value:0.3}]);assert.equal(rows[0].category,'Salary');});
test('save binds branch and expense to authorized business',async()=>{const {api,writes,checks}=setup();await api.createExpense(form());assert.deepEqual(checks,[['business-1','branch-1']]);assert.equal(writes[0].business_id,'business-1');assert.equal(writes[0].location_id,'branch-1');assert.equal(writes[0].amount,20.5);});
test('missing or unauthorized branch cannot create expense',async()=>{for(const foreign of [false,true]){const {api,writes}=setup(foreign);const data=form();if(!foreign)data.delete('locationId');await assert.rejects(api.createExpense(data));assert.equal(writes.length,0);}});
test('invalid category, date and fractional cents cannot be saved',async()=>{for(const [key,value] of [['category','invented'],['expenseDate','2026-02-30'],['amount','0.001'],['amount','-1']]){const {api,writes}=setup();const data=form();data.set(key,value);await assert.rejects(api.createExpense(data));assert.equal(writes.length,0);}});

const receipts=load('../lib/expenses/receipts.ts',{'server-only':{},'@/lib/supabase/admin':{supabaseAdmin:{}}});
test('receipt upload validates signature and size',async()=>{
 const valid=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'receipt.png',{type:'image/png'});
 assert.equal((await receipts.receiptBytes(valid)).type,'image/png');
 await assert.rejects(receipts.receiptBytes(new File(['<script>bad</script>'],'receipt.png',{type:'image/png'})),/valid JPG/);
 await assert.rejects(receipts.receiptBytes(new File([new Uint8Array(5*1024*1024+1)],'large.pdf',{type:'application/pdf'})),/5 MB/);
});
