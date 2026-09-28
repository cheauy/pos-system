const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const {mobileExpenses}=loadTs('lib/mobile/expense-list.ts');
test('expense paging and summary use identical branch, period and category filters',async()=>{
 const calls=[];
 const db={from:table=>{
  const q=queryDouble(table,call=>({data:table==='branch_pos_settings'?{currency:'USD'}:call.steps.find(s=>s[0]==='select')[1]==='amount'?Array.from({length:32},()=>({amount:0.1})):[{id:'sixteen',amount:0.1},{id:'seventeen',amount:0.1}],count:32,error:null}),calls);
  for(const method of ['gte','lte'])q[method]=(...args)=>{calls.at(-1).steps.push([method,...args]);return q;};return q;
 }};
 const result=await mobileExpenses(db,'business','branch',new URL('https://local?period=month&category=Rent&search=home&sort=oldest&page=2'),new Date('2026-09-28T00:00:00Z'));
 assert.equal(result.total,32);assert.equal(result.totalAmount,3.2);assert.equal(result.rows.length,2);
 for(const call of calls.filter(c=>c.table==='expenses'))for(const expected of [['eq','business_id','business'],['eq','location_id','branch'],['eq','category','Rent'],['gte','expense_date','2026-09-01'],['lte','expense_date','2026-09-30']])assert.ok(call.steps.some(s=>JSON.stringify(s)===JSON.stringify(expected)));
 assert.ok(calls[0].steps.some(s=>s[0]==='range'&&s[1]===15&&s[2]===29));
 assert.ok(calls[0].steps.some(s=>s[0]==='order'&&s[1]==='expense_date'&&s[2].ascending));
});
test('expense summary failures do not display an incomplete total',async()=>{
 const db={from:()=>{const q={};for(const name of ['select','eq','order','range'])q[name]=()=>q;q.then=ok=>Promise.resolve({data:null,error:{message:'offline'}}).then(ok);return q;}};
 await assert.rejects(()=>mobileExpenses(db,'b','l',new URL('https://local')),/Unable to load expenses/);
});
