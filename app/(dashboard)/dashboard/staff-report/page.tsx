import { requirePermission } from '@/lib/auth/require-permission';
import { getBranchContext, getViewingBranchId } from '@/lib/branches/context';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import NavigationForm from '@/components/navigation-form';
import { staffKpis, staffReportDates, type StaffSale } from '@/lib/analytics/staff-report';
import { BarChart3, ShoppingBag, Package, Users, Trophy } from 'lucide-react';

const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export default async function StaffReport({searchParams}:{searchParams:Promise<{branch?:string;range?:string;from?:string;to?:string}>}) {
 const business=await requirePermission('reports.view');
 const params=await searchParams;const context=await getBranchContext();
 const branchId=business.role==='owner'?await getViewingBranchId(params.branch):context.ownBranchId;
 const branches=business.role==='owner'?context.branches:context.branches.filter(b=>b.id===branchId);
 let dates;try{dates=staffReportDates(params.range,params.from,params.to);}catch(error){return <p role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900">{error instanceof Error?error.message:'Invalid date range.'} <a href="/dashboard/staff-report" className="underline">Reset dates</a></p>;}
 const db=await createClient();const orders:StaffSale[]=[];
 for(let offset=0;;offset+=500){
  let query=db.from('orders').select('id,order_number,staff_user_id,staff_name,order_source,status,total,discount,created_at,order_items(quantity),returns(refund_amount,status,return_items(quantity))')
   .eq('business_id',business.id).or('order_source.eq.pos,order_source.eq.manual,order_source.is.null').gte('created_at',dates.start).lte('created_at',dates.end).order('created_at').order('id').range(offset,offset+499);
  if(branchId)query=query.eq('location_id',branchId);
  const {data,error}=await query;if(error)throw new Error('Unable to load staff sales. Apply the staff report migration and retry.');
  orders.push(...(data??[]) as StaffSale[]);if(!data||data.length<500)break;
 }
 let roster=supabaseAdmin.from('business_members').select('user_id,team_name,role,default_location_id').eq('business_id',business.id).eq('is_active',true);
 if(branchId)roster=roster.or(`default_location_id.eq.${branchId},role.eq.owner`);
 const {data:members,error}=await roster;if(error)throw new Error('Unable to load staff.');
 const kpi=staffKpis(orders,(members??[]).map(m=>({userId:m.user_id,name:m.team_name||`${m.role==='owner'?'Owner':'Team member'}`})));
 const leaders=kpi.ranked.filter(r=>r.id!=='unassigned'&&r.orders>0).slice(0,5);
 return <main className="space-y-5">
  <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-950">Staff Report</h1><p className="mt-1 text-sm text-slate-500">Sales performance by staff · Cambodia time (UTC+7)</p></div><span className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">{branchId?branches.find(b=>b.id===branchId)?.name:'All branches'}</span></header>
  <NavigationForm className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
   <label className="text-xs font-semibold text-slate-500">Branch<select name="branch" defaultValue={branchId||'all'} className="mt-1 block min-w-44 rounded-lg border border-slate-200 p-2 text-sm text-slate-900">{business.role==='owner'&&<option value="all">All branches</option>}{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label className="text-xs font-semibold text-slate-500">Period<select name="range" defaultValue={params.range||'yesterday'} className="mt-1 block rounded-lg border border-slate-200 p-2 text-sm text-slate-900"><option value="yesterday">Yesterday</option><option value="today">Today</option><option value="7days">7 days</option><option value="30days">30 days</option><option value="custom">Custom dates</option></select></label>
   <label className="text-xs font-semibold text-slate-500">From<input type="date" name="from" defaultValue={dates.from} className="mt-1 block rounded-lg border border-slate-200 p-2 text-sm text-slate-900"/></label>
   <label className="text-xs font-semibold text-slate-500">To<input type="date" name="to" defaultValue={dates.to} className="mt-1 block rounded-lg border border-slate-200 p-2 text-sm text-slate-900"/></label>
   <button className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Apply</button>
  </NavigationForm>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{label:'Sales value',value:money(kpi.sales),icon:BarChart3},{label:'Orders',value:kpi.orders,icon:ShoppingBag},{label:'Average order',value:money(kpi.orders?kpi.sales/kpi.orders:0),icon:Users},{label:'Items sold',value:kpi.units,icon:Package}].map(c=><section key={c.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5"><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><c.icon size={22}/></span><div><p className="text-sm text-slate-500">{c.label}</p><strong className="text-2xl text-slate-950">{c.value}</strong></div></section>)}</div>
  {kpi.unassigned>0&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{kpi.unassigned} older orders have no reliable cashier identity. They appear as Unassigned and are excluded from staff rankings.</p>}
  <div className="grid items-start gap-5 lg:grid-cols-2">
   <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><Trophy size={20} className="text-amber-500"/>Top staff</h2><p className="mt-1 text-xs text-slate-500">Ranked by sales value</p><div className="mt-5 space-y-4">{leaders.map((r,i)=><div key={r.id}><div className="mb-1 flex justify-between text-sm"><span><strong className={i===0?'text-amber-600':i===1?'text-slate-500':'text-orange-700'}>#{i+1}</strong> {r.name}</span><strong>{money(r.sales)}</strong></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-500" style={{width:`${leaders[0]?.sales?Math.max(1,r.sales/leaders[0].sales*100):0}%`}}/></div><p className="mt-1 text-xs text-slate-500">{r.orders} orders · {r.units} items</p></div>)}{!leaders.length&&<p className="py-4 text-sm text-slate-500">No attributed staff sales in this period.</p>}</div></section>
   <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Top orders</h2><p className="mt-1 text-xs text-slate-500">Highest sales value</p><div className="mt-3 divide-y divide-slate-100">{kpi.topOrders.map(o=><div key={o.id} className="flex justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{o.order_number}</p><p className="text-xs text-slate-500">{o.staff_name||'Unassigned'}</p></div><strong className="text-sm">{money(Number(o.total)*100)}</strong></div>)}{!kpi.topOrders.length&&<p className="py-4 text-sm text-slate-500">No sales in this period.</p>}</div></section>
  </div>
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><h2 className="p-5 text-lg font-bold">Staff performance</h2><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Staff','Orders','Sales','Avg. order','Items','Discounts','Refunds','Cancelled','Completed'].map(h=><th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{kpi.ranked.map(r=><tr key={r.id}><td className="px-5 py-4 font-semibold">{r.name}</td>{[r.orders,money(r.sales),money(r.orders?r.sales/r.orders:0),r.units,money(r.discount),money(r.refunds),r.cancelled,`${r.orders?Math.round(r.completed/r.orders*100):0}%`].map((v,i)=><td key={i} className="px-5 py-4">{v}</td>)}</tr>)}</tbody></table></div><p className="border-t border-slate-100 p-4 text-xs leading-5 text-slate-500">POS and manual orders only. Cancelled orders are excluded from sales. Sales use current order totals after returns; refunds are shown separately and are not subtracted twice. Completed is the share of non-cancelled orders marked completed.</p></section>
 </main>;
}
