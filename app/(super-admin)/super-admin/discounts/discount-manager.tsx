'use client';

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, CalendarClock, ChevronLeft, ChevronRight, Eye, Gift, Info, Lightbulb, MoreVertical, Pencil, Percent, Plus, Power, Search, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { subscriptionPlans, subscriptionTerms } from '@/lib/subscriptions/plans';
import type { Promotion } from '@/lib/subscriptions/promotions';
import { managePromotion, savePromotion } from './actions';

const field='mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const statuses=['All','Active','Scheduled','Expired','Disabled'] as const;
type Status=typeof statuses[number];
function statusOf(rule:Promotion,today:string):Status {
  return !rule.enabled?'Disabled':rule.starts_on>today?'Scheduled':rule.ends_on<today?'Expired':'Active';
}
function StatusBadge({status}:{status:Status}) {
  const colors=status==='Active'?'bg-emerald-50 text-emerald-700':status==='Scheduled'?'bg-blue-50 text-blue-700':status==='Expired'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-600';
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${colors}`}>{status}</span>;
}

function ActionMenu({rule,children}:{rule:Promotion;children:ReactNode}) {
  const menu=useRef<HTMLDivElement>(null);
  return <><button popoverTarget={`discount-actions-${rule.id}`} aria-label={`Actions for ${rule.name}`} onClick={event=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    if(menu.current){menu.current.style.top=`${Math.max(8,Math.min(bounds.bottom+4,window.innerHeight-170))}px`;menu.current.style.left=`${Math.max(8,bounds.right-160)}px`;}
  }} className="flex w-8 justify-center rounded-lg border border-slate-200 py-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical size={17}/></button><div ref={menu} id={`discount-actions-${rule.id}`} popover="auto" className="fixed inset-auto m-0 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg" onClick={()=>menu.current?.hidePopover()}>{children}</div></>;
}

export default function DiscountManager({rules,today}:{rules:Promotion[];today:string}) {
  const [panel,setPanel]=useState<{mode:'new'|'edit'|'view';id?:string}|null>(null);
  const [version,setVersion]=useState(0);
  const [tab,setTab]=useState<Status>('All');
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(10);
  const [busy,setBusy]=useState(false);
  const panelRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(panel){panelRef.current?.focus({preventScroll:true});if(window.innerWidth<1280)panelRef.current?.scrollIntoView({block:'start',behavior:'smooth'});}
  },[panel,version]);
  const selected=rules.find(rule=>rule.id===panel?.id)??null;
  const filtered=rules.filter(rule=>(tab==='All'||statusOf(rule,today)===tab)&&rule.name.toLowerCase().includes(search.trim().toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,pages);
  const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const count=(status:Status)=>status==='All'?rules.length:rules.filter(rule=>statusOf(rule,today)===status).length;
  const open=(mode:'new'|'edit'|'view',rule?:Promotion)=>{setPanel({mode,id:rule?.id});setVersion(value=>value+1);};
  async function change(rule:Promotion,operation:'enable'|'disable'|'delete') {
    if(busy)return;
    if(operation==='delete'&&!window.confirm(`Delete “${rule.name}”? This cannot be undone. Existing payment quotes will stay unchanged.`))return;
    setBusy(true);
    try {
      const result=await managePromotion(rule.id,operation);
      if(result.error){toast.error(result.error);return;}
      toast.success(operation==='delete'?'Discount deleted.':operation==='disable'?'Discount disabled.':'Discount enabled.');
      if(operation==='delete'&&panel?.id===rule.id)setPanel(null);
    } catch {toast.error('Unable to change discount. Please try again.');}
    finally {setBusy(false);}
  }
  return <main className="space-y-5 pb-8 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><Percent size={23}/></span><div><h1 className="text-2xl font-bold tracking-tight">Plan Discounts</h1><p className="mt-1 text-sm text-slate-500">Create and manage discounts for new and existing customers.</p></div></div>
      <button disabled={busy} onClick={()=>open('new')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Plus size={17}/>Add discount</button>
    </header>
    <div className={`grid items-start gap-5 ${panel?'xl:grid-cols-[minmax(0,1fr)_350px]':''}`}>
      <div className="min-w-0 space-y-5">
        <section aria-label="Discount overview" className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
          {[
            {label:'Total discounts',value:rules.length,note:`${count('Active')} active · ${count('Expired')} expired`,icon:Gift,color:'bg-blue-50 text-blue-600'},
            {label:'Active offers',value:count('Active'),note:'Available at checkout',icon:BadgeCheck,color:'bg-emerald-50 text-emerald-600'},
            {label:'Scheduled offers',value:count('Scheduled'),note:'Upcoming discounts',icon:CalendarClock,color:'bg-violet-50 text-violet-600'},
            {label:'Avg. discount rate',value:rules.length?`${(rules.reduce((sum,rule)=>sum+Number(rule.discount_percent),0)/rules.length).toFixed(1)}%`:'—',note:'Across all offers',icon:Tag,color:'bg-amber-50 text-amber-600'},
          ].map(item=><div key={item.label} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><span className={`rounded-lg p-2 ${item.color}`}><item.icon size={19}/></span><div><p className="text-xs text-slate-500">{item.label}</p><p className="mt-1 text-xl font-bold">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.note}</p></div></div>)}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
            <div className="flex flex-wrap gap-1" aria-label="Filter by status">{statuses.map(status=><button key={status} onClick={()=>{setTab(status);setPage(1);}} aria-pressed={tab===status} className={`rounded-lg px-2.5 py-2 text-xs font-medium ${tab===status?'bg-blue-50 text-blue-700':'text-slate-500 hover:bg-slate-50'}`}>{status}<span className="ml-1.5 rounded bg-slate-100 px-1 text-slate-600">{count(status)}</span></button>)}</div>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-400"><Search size={15}/><input aria-label="Search discount offers" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}} placeholder="Search offer name…" className="w-36 bg-transparent text-xs text-slate-900 outline-none"/></label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500"><tr>{['Offer name','Plan / term','Discount','Validity period','Status','Actions'].map(label=><th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{shown.map((rule,index)=><tr key={rule.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-5"><button onClick={()=>open('view',rule)} className="flex items-center gap-3 text-left"><span className={`rounded-lg p-2 ${['bg-amber-50 text-amber-500','bg-blue-50 text-blue-500','bg-rose-50 text-rose-500'][index%3]}`}><Gift size={19}/></span><span className="min-w-32 font-semibold hover:text-blue-600">{rule.name}<span className="mt-1 block text-xs font-normal text-slate-500">{[rule.apply_new?'New customers':null,rule.apply_existing?'Existing customers':null].filter(Boolean).join(' · ')}</span></span></button></td>
                <td className="px-4 py-5 text-xs font-medium">{rule.plan_key?subscriptionPlans[rule.plan_key].name:'All plans'}<span className="mt-1 block font-normal text-slate-500">{rule.term_months?`${rule.term_months} month${rule.term_months===1?'':'s'}`:'All terms'}</span></td>
                <td className="px-4 py-5"><span className="font-bold text-blue-600">{rule.discount_percent}%</span><span className="mt-1 block text-xs text-slate-500">Percentage</span></td>
                <td className="whitespace-nowrap px-4 py-5 text-xs">{rule.starts_on}<span className="mt-1 block text-slate-500">to {rule.ends_on}</span></td>
                <td className="px-4 py-5"><StatusBadge status={statusOf(rule,today)}/></td>
                <td className="px-4 py-5"><ActionMenu rule={rule}>
                  <button disabled={busy} onClick={()=>open('view',rule)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-slate-50"><Eye size={15}/>View details</button>
                  <button disabled={busy} onClick={()=>void change(rule,rule.enabled?'disable':'enable')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-slate-50"><Power size={15}/>{rule.enabled?'Disable':'Enable'}</button>
                  <button disabled={busy} onClick={()=>open('edit',rule)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-slate-50"><Pencil size={15}/>Edit</button>
                  <button disabled={busy} onClick={()=>void change(rule,'delete')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-600 hover:bg-red-50"><Trash2 size={15}/>Delete</button>
                </ActionMenu></td>
              </tr>)}</tbody>
            </table>{!shown.length&&<div className="px-4 py-12 text-center text-sm text-slate-500"><Gift className="mx-auto mb-3 text-slate-300" size={28}/>{rules.length?'No discounts match your filters.':'No discounts yet. Create your first offer.'}</div>}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>Showing {shown.length?((currentPage-1)*pageSize)+1:0}–{Math.min(currentPage*pageSize,filtered.length)} of {filtered.length} discounts</span><div className="flex items-center gap-2"><button aria-label="Previous page" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronLeft size={14}/></button><span>{currentPage} / {pages}</span><button aria-label="Next page" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronRight size={14}/></button><select aria-label="Discounts per page" value={pageSize} onChange={event=>{setPageSize(Number(event.target.value));setPage(1);}} className="ml-2 rounded-lg border border-slate-200 bg-white p-2">{[10,25,50].map(size=><option key={size} value={size}>{size} / page</option>)}</select></div></footer>
        </section>
        <section className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/30 p-5"><Lightbulb size={21} className="shrink-0 text-blue-500"/><div><h2 className="text-sm font-semibold">Tips for discounts</h2><ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-500"><li>Reward new and returning customers with offers for specific plans and billing terms.</li><li>The best eligible discount applies automatically. Discounts do not stack.</li><li>Dates include the full day in Cambodia (UTC+7). Existing payment quotes keep their saved amount.</li></ul></div></section>
      </div>
      {panel&&<aside ref={panelRef} tabIndex={-1} aria-label={panel.mode==='view'?'Discount details':panel.mode==='edit'?'Edit discount':'Create new discount'} className="order-first rounded-xl border border-slate-200 bg-white outline-none xl:sticky xl:top-5 xl:order-last">
        <div className="flex items-center justify-between border-b border-slate-100 p-4"><h2 className="text-sm font-bold">{panel.mode==='view'?'Discount details':panel.mode==='edit'?'Edit discount':'Create new discount'}</h2><button aria-label="Close discount panel" onClick={()=>setPanel(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
        {panel.mode==='view'&&selected?<div className="space-y-5 p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><Gift size={24}/></span><div><h3 className="font-bold break-words">{selected.name}</h3><div className="mt-2"><StatusBadge status={statusOf(selected,today)}/></div></div></div><div className="rounded-xl bg-blue-50 p-5 text-center"><p className="text-3xl font-bold text-blue-600">{selected.discount_percent}%</p><p className="mt-1 text-xs text-blue-600">Percentage discount</p></div><dl className="divide-y divide-slate-100 text-sm">{[
          ['Plan',selected.plan_key?subscriptionPlans[selected.plan_key].name:'All plans'],['Billing term',selected.term_months?`${selected.term_months} months`:'All terms'],['Starts on',selected.starts_on],['Ends on',selected.ends_on],['New customers',selected.apply_new?'Included':'Not included'],['Existing customers',selected.apply_existing?'Included':'Not included'],
        ].map(([label,value])=><div key={label} className="flex justify-between gap-3 py-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}</dl><p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">Existing customers include upgrades, renewals and reactivations. Remaining-time upgrade charges stay unchanged.</p><button disabled={busy} onClick={()=>open('edit',selected)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 p-2.5 text-sm font-semibold text-white"><Pencil size={15}/>Edit discount</button></div>
          :panel.mode!=='view'?<DiscountForm key={`${panel.id??'new'}-${version}`} rule={panel.mode==='edit'?selected:null} today={today} onClose={()=>setPanel(null)}/>:<p className="p-5 text-sm text-slate-500">This discount is no longer available.</p>}
      </aside>}
    </div>
  </main>;
}

function DiscountForm({rule,today,onClose}:{rule:Promotion|null;today:string;onClose:()=>void}) {
  const [state,action,pending]=useActionState(savePromotion,{error:null,saved:false});
  return <form action={action} onReset={event=>event.preventDefault()} className="space-y-4 p-4">
    <p className="border-b border-blue-100 pb-3 text-xs font-semibold text-blue-600">Basic information</p>
    <input type="hidden" name="id" value={state.id??rule?.id??''}/>
    <label className="block text-xs font-medium">Offer name <span className="text-red-500">*</span><input name="name" required maxLength={80} defaultValue={rule?.name??''} placeholder="e.g. Happy New Year" className={field}/></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">Plan<select name="plan" defaultValue={rule?.plan_key??''} className={field}><option value="">All plans</option>{Object.values(subscriptionPlans).map(plan=><option key={plan.key} value={plan.key}>{plan.name}</option>)}</select></label><label className="text-xs font-medium">Billing term<select name="term" defaultValue={rule?.term_months??''} className={field}><option value="">All terms</option>{subscriptionTerms.map(term=><option key={term.months} value={term.months}>{term.label}</option>)}</select></label></div>
    <label className="block text-xs font-medium">Percentage discount <span className="text-red-500">*</span><input name="percent" type="number" min={1} max={90} step="0.01" required defaultValue={rule?.discount_percent??10} className={field}/><span className="mt-1 block font-normal text-slate-400">Enter a value between 1% and 90%.</span></label>
    <fieldset><legend className="mb-1 text-xs font-medium">Validity period <span className="text-red-500">*</span></legend><div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-500">Start date<input name="startsOn" type="date" required defaultValue={rule?.starts_on??today} className={field}/></label><label className="text-xs text-slate-500">End date<input name="endsOn" type="date" required defaultValue={rule?.ends_on??today} className={field}/></label></div></fieldset>
    <fieldset className="space-y-2 text-xs"><legend className="mb-2 font-medium">Apply to</legend><label className="flex items-center gap-2"><input name="applyNew" type="checkbox" className="accent-blue-600" defaultChecked={rule?.apply_new??true}/>New customers</label><label className="flex items-center gap-2"><input name="applyExisting" type="checkbox" className="accent-blue-600" defaultChecked={rule?.apply_existing??true}/>Existing customers</label><label className="flex items-center gap-2"><input name="enabled" type="checkbox" className="accent-blue-600" defaultChecked={rule?.enabled??true}/>Enabled</label></fieldset>
    <p className="flex gap-2 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-700"><Info size={16} className="mt-0.5 shrink-0"/>This discount applies automatically at checkout when the conditions match.</p>
    {state.error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}{state.saved&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Discount saved.</p>}
    <div className="flex gap-2 border-t border-slate-100 pt-3"><button type="button" disabled={pending} onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold">Cancel</button><button disabled={pending} className="flex-1 rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{pending?'Saving…':'Save discount'}</button></div>
  </form>;
}
