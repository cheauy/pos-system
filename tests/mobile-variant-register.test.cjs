const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const {matchingVariants}=loadTs('mobile/src/variant-selection.ts');
const model=loadTs('app/(dashboard)/dashboard/register/register-model.ts');
const {mobileRegisterDetail}=loadTs('lib/mobile/register-detail.ts',{'@/app/(dashboard)/dashboard/register/register-model':model});

test('separate size and colour keep exact product IDs and reject unavailable combinations',()=>{
 const rows=[{id:'red-s',color:'Red',size:'S',available:2},{id:'red-l',color:'Red',size:'L',available:0},{id:'blue-l',color:'Blue',size:'L',available:3}];
 assert.deepEqual(matchingVariants(rows,'Red','S').map(row=>row.id),['red-s']);
 assert.deepEqual(matchingVariants(rows,'Blue','S'),[]);
 assert.equal(matchingVariants(rows,'Red','L')[0].available,0);
 assert.deepEqual(matchingVariants([{id:'one',color:null,size:null,available:1}],'','').map(row=>row.id),['one']);
});

test('register detail stays in branch and uses website totals for split payments and refunds',async()=>{
 const calls=[];
 const records={cash_register_shifts:{id:'shift',status:'open',opening_cash:100,closing_cash:null,variance:null,opened_at:'2026-09-27T00:00:00Z'},cash_movements:[{id:'refund',shift_id:'shift',movement_type:'cash_out',amount:5,reason:'Return',reference:'return:order'},{id:'float',shift_id:'shift',movement_type:'cash_in',amount:10,reason:'Float'}],orders:[{id:'order',register_shift_id:'shift',payment_method:'split',amount_paid:60,change_amount:10,status:'completed',pos_checkout:{tenders:[{method:'cash',amount:40},{method:'bank_transfer',amount:20}]}}],branch_pos_settings:{currency:'KHR'}};
 const db={from:table=>queryDouble(table,{data:records[table],error:null},calls)};
 const result=await mobileRegisterDetail(db,'business','branch','shift');
 assert.equal(result.summary.cash,30);assert.equal(result.summary.noncash,20);assert.equal(result.summary.refunds,5);assert.equal(result.summary.expected,135);assert.equal(result.currency,'KHR');
 assert.ok(calls.every(call=>call.steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business')));
 assert.ok(calls.filter(call=>['orders','cash_register_shifts'].includes(call.table)).every(call=>call.steps.some(step=>step[0]==='eq'&&step[1]==='location_id'&&step[2]==='branch')));
 records.cash_register_shifts={...records.cash_register_shifts,status:'closed',register_summary:{cash:1,noncash:2,refunds:3,incoming:4,outgoing:5,expected:100}};
 assert.equal((await mobileRegisterDetail(db,'business','branch','shift')).summary.expected,100,'closed shift uses its saved summary');
});
