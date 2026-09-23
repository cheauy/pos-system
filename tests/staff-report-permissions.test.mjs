import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
function load(file,deps={}){const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});const m={exports:{}};new Function('require','module','exports',outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id];},m,m.exports);return m.exports;}
const model=load('../lib/analytics/staff-report.ts');const access=load('../lib/auth/permissions.ts');
const sale={id:'one',order_number:'POS-1',staff_user_id:'a',staff_name:'Sok',order_source:'pos',status:'completed',total:20,discount:2,created_at:'2026-09-23',order_items:[{quantity:3}],returns:[{refund_amount:10,status:'refunded',return_items:[{quantity:1}]}]};
test('staff KPIs use recorded cashiers, exclude online/cancelled sales, and do not double-subtract refunds',()=>{
 const r=model.staffKpis([sale,{...sale,id:'cancel',status:'cancelled'},{...sale,id:'online',order_source:'online_store'},{...sale,id:'old',staff_user_id:null,staff_name:null,total:5,returns:[],order_items:[{quantity:1}]}],[{userId:'b',name:'No sales'}]);
 assert.equal(r.sales,2500);assert.equal(r.orders,2);assert.equal(r.units,3);assert.equal(r.unassigned,1);assert.equal(r.topOrders.length,2);
 assert.deepEqual(r.ranked.find(x=>x.id==='a'),{id:'a',name:'Sok',orders:1,sales:2000,units:2,discount:200,refunds:1000,cancelled:1,completed:1});
 assert.equal(r.ranked.find(x=>x.id==='b').orders,0);
});
test('report periods use Cambodia day boundaries and validate custom dates',()=>{
 const d=model.staffReportDates('yesterday',undefined,undefined,new Date('2026-09-22T18:30:00Z'));
 assert.equal(d.from,'2026-09-22');assert.equal(d.start,'2026-09-22T00:00:00+07:00');
 assert.throws(()=>model.staffReportDates('custom','2026-02-31','2026-03-05'),/valid dates/);
 assert.throws(()=>model.staffReportDates('custom','2025-01-01','2026-09-23'),/one year/);
});
test('POS selection includes its supporting permissions and removal follows dependencies',()=>{
 const p=access.normalizePermissionSelection(['pos.access']);
 for(const key of ['orders.create','orders.view','register.manage','products.view','customers.view'])assert.ok(p.includes(key));
 assert.ok(!access.removePermissionWithDependents(p,'orders.view').includes('pos.access'));
 const sql=readFileSync(new URL('../supabase/migrations/20260923160000_staff_reports_user_permissions.sql',import.meta.url),'utf8');
 const known=[...sql.match(/known text\[\]:=array\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(known,[...access.permissions]);
});
test('effective permissions apply only the current member override, not the role matrix',async()=>{
 const query=table=>{const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:{id:'member-a',role:'staff',is_active:true,team_password_required:false},error:null};},then(resolve){resolve({data:table==='business_member_permissions'?[{permission:'products.view',enabled:false},{permission:'reports.view',enabled:true}]:[],error:null});}};return q;};
 const effective=load('../lib/auth/effective-permissions.ts',{'server-only':{},react:{cache:f=>f},'@/lib/supabase/admin':{supabaseAdmin:{from:query}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'staff-a'}},error:null})}})},'@/lib/auth/permissions':access});
 const own=await effective.getEffectivePermissions('business','staff');assert.ok(own.includes('reports.view'));assert.ok(!own.includes('products.view'));
 const defaults=await effective.getRolePermissions('business','staff');assert.ok(defaults.includes('products.view'));assert.ok(!defaults.includes('reports.view'));
 assert.deepEqual(await effective.getEffectivePermissions('business','manager'),[]);
});
