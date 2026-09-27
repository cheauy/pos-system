const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const {expenseCategories,mobileExpenseBreakdown}=loadTs('lib/mobile/expense-breakdown.ts',{'@/lib/analytics/staff-report':{staffReportDates:()=>({from:'2026-09-01',to:'2026-09-27'})}});
test('expense categories sum cents without turning invalid values into chart totals',()=>{
 assert.deepEqual(expenseCategories([{category:'Rent',amount:'0.1'},{category:'Rent',amount:'0.2'},{category:null,amount:5}]),[{name:'Other',value:5},{name:'Rent',value:0.3}]);
 assert.throws(()=>expenseCategories([{category:'Rent',amount:'NaN'}]),/invalid/);
 assert.throws(()=>expenseCategories([{category:'Rent',amount:-1}]),/invalid/);
});
test('breakdown fetches beyond the displayed page with business, branch and date restrictions',async()=>{
 const calls=[],rows=Array.from({length:501},(_,id)=>({id,category:'Supplies',amount:1}));
 const db={from(table){const steps=[];calls.push({table,steps});let bounds=[0,499];const q={};for(const name of ['select','eq','gte','lte','order','single'])q[name]=(...args)=>{steps.push([name,...args]);return q;};q.range=(a,b)=>{bounds=[a,b];return q;};q.then=(yes,no)=>Promise.resolve({data:table==='expenses'?rows.slice(bounds[0],bounds[1]+1):{currency:'USD'},error:null}).then(yes,no);return q;}};
 const result=await mobileExpenseBreakdown(db,'business','branch','30days');
 assert.equal(result.count,501);assert.deepEqual(result.rows,[{name:'Supplies',value:501}]);
 for(const call of calls){assert.ok(call.steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business'));assert.ok(call.steps.some(step=>step[0]==='eq'&&step[1]==='location_id'&&step[2]==='branch'));}
 for(const call of calls.filter(call=>call.table==='expenses')){assert.ok(call.steps.some(step=>step[0]==='gte'&&step[1]==='expense_date'));assert.ok(call.steps.some(step=>step[0]==='lte'&&step[1]==='expense_date'));}
 await assert.rejects(()=>mobileExpenseBreakdown(db,'business','branch','all'),/supported/);
});
