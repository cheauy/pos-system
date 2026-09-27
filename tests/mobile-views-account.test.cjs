const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
test('view choices persist by account and menu, ignore invalid storage and preserve a newer tap',async()=>{
 let states=[],refs=[],cursor=0,refCursor=0,effects=[],read;
 const writes=[];
 const hooks={useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=value;}];},useRef:initial=>refs[refCursor++]??(refs[refCursor-1]={current:initial}),useEffect:fn=>effects.push(fn)};
 const {useViewPreference}=loadTs('mobile/src/view-preference.ts',{react:hooks,'./client':{deviceStorage:{getItem:()=>new Promise(resolve=>{read=resolve;}),setItem:async(...args)=>{writes.push(args);}}}});
 const scope={userId:'one',businessId:'shop'};
 const render=(menu='Stock',user=scope)=>{cursor=0;refCursor=0;effects=[];return useViewPreference(user,menu,1,3);};
 let view=render();effects[0]();view.change(3);read('2');await new Promise(resolve=>setImmediate(resolve));view=render();assert.equal(view.value,3);assert.equal(writes.at(-1)[1],'3');
 states=[];refs=[];assert.equal(render().value,3,'returning to Stock retains its selection');
 states=[];refs=[];assert.equal(render('Products').value,1,'different menus retain separate views');
 states=[];refs=[];view=render('Stock',{...scope,userId:'two'});assert.equal(view.value,1);effects[0]();read('999');await new Promise(resolve=>setImmediate(resolve));assert.equal(render('Stock',{...scope,userId:'two'}).value,1);
});
test('one-year overview has 365 inclusive local dates and includes today',()=>{
 const {staffReportDates}=loadTs('lib/analytics/staff-report.ts');
 const dates=staffReportDates('365days',undefined,undefined,new Date('2026-09-26T18:00:00Z'));
 assert.equal(dates.to,'2026-09-27');assert.equal((Date.parse(dates.to)-Date.parse(dates.from))/86400000,364);assert.ok(dates.start.endsWith('+07:00'));
});
test('new account readers scope profiles, staff branches and category visibility',async()=>{
 const calls=[],{mobileAccountRead}=loadTs('lib/mobile/account-read.ts',{
  '@/app/(dashboard)/dashboard/settings/users/users-workspace-actions':{loadUsersWorkspace:async()=>({success:true,data:{rows:[],branches:[],seatsUsed:1,seatLimit:2}})},
  '@/lib/subscriptions/branch-limits':{getBranchEntitlement:async()=>({used:1,limit:2})},
 });
 const db={from:table=>queryDouble(table,{data:table==='profiles'?{full_name:'Me'}:[],error:null},calls)};
 const business={id:'business',name:'Store',role:'staff'};
 await mobileAccountRead(db,'account-profile',business,'assigned',{id:'me',email:'me@example.com'});
 assert.ok(calls[0].steps.some(s=>s[0]==='eq'&&s[1]==='id'&&s[2]==='me'));
 await mobileAccountRead(db,'account-branches',business,'assigned',{id:'me'});
 assert.ok(calls[1].steps.some(s=>s[0]==='eq'&&s[1]==='business_id'&&s[2]==='business'));
 assert.ok(calls[1].steps.some(s=>s[0]==='eq'&&s[1]==='id'&&s[2]==='assigned'));
 await mobileAccountRead(db,'account-categories',business,'assigned',{id:'me'});
 assert.ok(calls[2].steps.some(s=>s[0]==='or'&&s[1]==='branch_ids.is.null,branch_ids.cs.{assigned}'));
 const users=await mobileAccountRead(db,'account-users',business,'assigned',{id:'me'});assert.equal(users.summary,'1 / 2 users');
});
