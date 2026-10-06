import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import {loadTs,queryDouble} from './helpers/load-ts.cjs';

const readAllRows=loadTs('lib/supabase/read-all-rows.ts',{});
// queryDouble plus the range filters the report uses.
const rangeDouble=(table,result,log)=>{const q=queryDouble(table,result,log);const call=log[log.length-1];for(const n of ['gte','lte'])q[n]=(...a)=>{call.steps.push([n,...a]);return q;};return q;};
const icons=new Proxy({},{get:()=>()=>null});

test('register loads movements and orders only for shifts without a saved summary',async()=>{
  const queries=[];
  const shifts=[
    {id:'open',status:'open',location_id:'own',opened_by:'u',opened_at:'2026-10-03'},
    {id:'saved',status:'closed',register_summary:{cash:1,noncash:0,incoming:0,outgoing:0,refunds:0,expected:1},location_id:'own',opened_by:'u',opened_at:'2026-10-02'},
    {id:'legacy',status:'closed',register_summary:null,location_id:'own',opened_by:'u',opened_at:'2026-10-01'},
  ];
  const db={from:table=>queryDouble(table,()=>({error:null,data:table==='business_locations'?[{id:'own',is_active:true}]:table==='cash_register_shifts'?shifts:[]}),queries)};
  const Page=loadTs('app/(dashboard)/dashboard/register/page.tsx',{'react/jsx-runtime':jsx,'@/lib/branches/context':{getBranchContext:async()=>({branchId:'own'})},'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',role:'staff'})},'@/lib/supabase/admin':{supabaseAdmin:db},'@/lib/supabase/read-all-rows':readAllRows,'./register-client':()=>null}).default;
  const page=await Page();
  for(const table of ['cash_movements','orders']){
    const ids=queries.find(q=>q.table===table).steps.find(s=>s[0]==='in')[2];
    assert.deepEqual(ids,['open','legacy'],table);
  }
  assert.deepEqual(page.props.shifts.map(s=>s.id),['open','saved','legacy']);
});

test('report totals include every order past the per-response row cap',async()=>{
  const queries=[];
  const orders=Array.from({length:1203},(_,i)=>({id:`o${i}`,order_number:`#${i}`,total:2.5,status:'completed',payment_method:'cash',created_at:'2026-10-01T03:00:00Z',order_items:[{product_id:'p',product_name:'P',quantity:1,unit_price:2.5,cost_price:1,subtotal:2.5,variant_label:null,products:null}]}));
  // Simulate PostgREST: a range is honoured, but no response exceeds 1000 rows.
  const page=(rows)=>call=>{const r=call.steps.find(s=>s[0]==='range');const [from,to]=r?[r[1],r[2]]:[0,999];return {error:null,data:rows.slice(from,Math.min(to,from+999)+1)};};
  const db={from:table=>rangeDouble(table,table==='orders'?page(orders):table==='expenses'?page([{id:'e',category:'Rent',description:'r',amount:100,expense_date:'2026-10-01'}]):{error:null,data:[]},queries)};
  const Page=loadTs('app/(dashboard)/dashboard/reports/page.tsx',{'react/jsx-runtime':jsx,'@/lib/branches/context':{getViewingBranchId:async()=>''},'@/components/view-branch-select':()=>null,'@/components/navigation-form':()=>null,'@/lib/analytics/product-variants':{soldVariant:i=>({key:i.product_id,label:i.product_name})},'@/components/analytics-charts':{DonutBreakdown:()=>null},'next/link':()=>null,'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business'})},'lucide-react':icons,'./report-charts':()=>null,'@/lib/supabase/server':{createClient:async()=>db},'@/lib/supabase/read-all-rows':readAllRows}).default;
  const tree=await Page({searchParams:Promise.resolve({range:'custom',from:'2026-10-01',to:'2026-10-01'})});
  const cards={};
  (function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node))return node.forEach(walk);if(node.props?.title&&node.props.value!==undefined)cards[node.props.title]=node.props.value;walk(node.props?.children);})(tree);
  assert.equal(cards['Total Orders'],'1203');
  assert.equal(cards.Revenue,'$3,007.50');
  assert.equal(cards['Cost of Goods'],'$1,203.00');
  assert.equal(cards['Net Profit'],'$1,704.50');
  assert.ok(queries.filter(q=>q.table==='orders').length>=3);
});
