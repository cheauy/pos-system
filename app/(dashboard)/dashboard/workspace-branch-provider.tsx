'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ArrowRightLeft, Check, ChevronDown, Loader2, Store, X } from 'lucide-react';
import { branchChannelKey, branchDestination } from '@/lib/branches/switch-model';
import { getOperatingBranchStatus, switchOperatingBranch } from './branch-actions';

type Guard=(targetId?:string)=>string|null;
type SwitchContext={requestSwitch:(id:string)=>Promise<void>;registerGuard:(guard:Guard)=>()=>void};
const Context=createContext<SwitchContext|null>(null);
export function useWorkspaceBranch() {
  const context=useContext(Context);
  if(!context)throw new Error('Workspace branch provider is missing.');
  return context;
}
export function useBranchSwitchGuard(guard:Guard) {
  const {registerGuard}=useWorkspaceBranch();
  const latest=useRef(guard);latest.current=guard;
  useEffect(()=>registerGuard(target=>latest.current(target)),[registerGuard]);
}

type Props={businessId:string;userId:string;branchId:string;branches:{id:string;name:string}[];children:ReactNode};
export default function WorkspaceBranchProvider(p:Props) {
  const pathname=usePathname();
  const [open,setOpen]=useState(false),[selected,setSelected]=useState(p.branchId);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState('');
  const guards=useRef(new Set<Guard>()),dirty=useRef(false),saving=useRef(false);
  const modal=useRef<HTMLDialogElement>(null),staleDialog=useRef<HTMLDialogElement>(null);
  const content=useRef<HTMLDivElement>(null),channel=useRef<BroadcastChannel|null>(null);
  const key=branchChannelKey(p.businessId,p.userId);
  const currentName=p.branches.find(b=>b.id===p.branchId)?.name || 'No active branch';
  const registerGuard=useCallback((guard:Guard)=>{guards.current.add(guard);return()=>{guards.current.delete(guard);};},[]);
  const guardReason=useCallback((targetId?:string)=>{
    for(const guard of guards.current){const reason=guard(targetId);if(reason)return reason;}
    return null;
  },[]);
  useEffect(()=>{dirty.current=false;setOpen(false);setError('');},[pathname]);
  useEffect(()=>{
    const dlg=modal.current;
    if(open && dlg && !dlg.open)dlg.showModal();else if(!open)dlg?.close();
  },[open]);
  useEffect(()=>{
    const dlg=staleDialog.current;
    if(stale && dlg && !dlg.open){modal.current?.close();dlg.showModal();} else if(!stale)dlg?.close();
  },[stale]);
  useEffect(()=>{
    let live=true,checking=false;
    async function check(){
      if(!live||saving.current||checking||document.visibilityState!=='visible')return;
      checking=true;
      try {
        const result=await getOperatingBranchStatus(p.businessId,p.userId);
        if(!live)return;
        if(!result.success)setStale(result.message);
        else if(result.branchId!==p.branchId)setStale('This workspace is now using another branch in a different tab. Reload before continuing.');
      } catch { /* Transient connectivity does not change the local context. Writes still verify it. */ }
      finally{checking=false;}
    }
    const signal=()=>{void check();};
    const storage=(e:StorageEvent)=>{if(e.key===key)signal();};
    try {if(typeof BroadcastChannel!=='undefined'){channel.current=new BroadcastChannel(key);channel.current.onmessage=signal;}} catch { /* Focus/storage fallback. */ }
    window.addEventListener('storage',storage);window.addEventListener('focus',signal);
    document.addEventListener('visibilitychange',signal);
    const timer=setInterval(signal,30000);
    return()=>{live=false;clearInterval(timer);channel.current?.close();channel.current=null;window.removeEventListener('storage',storage);window.removeEventListener('focus',signal);document.removeEventListener('visibilitychange',signal);};
  },[p.businessId,p.userId,p.branchId,key]);
  const requestSwitch=useCallback(async(id:string)=>{
    if(saving.current || id===p.branchId)return;
    if(stale){setError('Reload this workspace before switching branches.');return;}
    const reason=guardReason(id);
    if(reason){setError(reason);setOpen(true);return;}
    if(!p.branches.some(b=>b.id===id)){setError('Choose an available branch.');return;}
    const name=p.branches.find(b=>b.id===id)?.name || 'the selected branch';
    if(!window.confirm(`Switch the entire workspace to ${name}? ${dirty.current?'Unsaved changes on this page will be discarded. ':''}Save or hold unfinished work first. Open registers and saved orders remain in their original branch.`))return;
    saving.current=true;setBusy(true);setError('');
    try {
      const result=await switchOperatingBranch(id,{businessId:p.businessId,userId:p.userId,branchId:p.branchId});
      if(!result.success){setError(result.message);setOpen(true);return;}
      const notice={branchId:result.branchId,at:Date.now()};
      try {localStorage.setItem(key,JSON.stringify(notice));channel.current?.postMessage(notice);} catch { /* Cookie and fresh navigation are authoritative. */ }
      // A full navigation invalidates every old client cache, cart state and view
      // filter. No view-only branch filter is carried into the new workspace.
      setStale("Branch saved. Reload the workspace to continue in the selected branch.");
      window.location.assign(branchDestination(pathname));
    } catch {setStale('The switch result could not be confirmed. Reload the workspace to read the saved branch before continuing.');}
    finally{saving.current=false;setBusy(false);}
  },[p.businessId,p.userId,p.branchId,p.branches,pathname,key,stale,guardReason]);
  function reload(){
    // Do not abandon a payment/save still running. POS registers this guard.
    const reason=guardReason();
    if(reason && /saving|in progress|working|processing/i.test(reason)){setStale(reason);return;}
    if(!window.confirm('Reload the workspace? Unsaved page changes will be lost. Saved holds and pending sale request IDs are retained; never collect a payment twice.'))return;
    window.location.assign(branchDestination(pathname));
  }
  return <Context.Provider value={{requestSwitch,registerGuard}}>
    <div ref={content} inert={busy || Boolean(stale)} onInputCapture={()=>{dirty.current=true;}} onChangeCapture={()=>{dirty.current=true;}}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 sm:px-6 lg:ml-16 dark:border-slate-800 dark:bg-slate-900" data-workspace-branch-header>
        <div className="flex min-w-0 items-center gap-2 text-sm"><Store size={18} className="shrink-0 text-blue-600"/><span className="text-slate-500">Workspace:</span><strong className="truncate text-slate-900 dark:text-white">{currentName}</strong></div>
        <button type="button" aria-label="Switch Branches" aria-haspopup="dialog" disabled={busy||Boolean(stale)||p.branches.length<2} onClick={()=>{setSelected(p.branchId);setOpen(true);setError('');}} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
          <ArrowRightLeft size={16}/>Switch Branches<ChevronDown size={15}/>
        </button>
      </div>
      {p.children}
    </div>
    <dialog ref={modal} aria-label="Switch workspace branch" onCancel={e=>{if(busy)e.preventDefault();else setOpen(false);}} className="m-auto w-[min(94vw,520px)] rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:bg-slate-900 dark:text-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h2 className="text-lg font-bold">Switch Branches</h2><button type="button" aria-label="Close branch switcher" disabled={busy} onClick={()=>setOpen(false)}><X size={20}/></button></header>
      <div className="space-y-4 p-5"><p className="text-sm text-slate-500">Switch POS, register, customers, orders, purchases and default report views together. Business settings and shared product definitions stay with this business.</p>
        <div role="radiogroup" aria-label="Workspace branch" className="max-h-72 space-y-2 overflow-auto">{p.branches.map(b=><label key={b.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selected===b.id?'border-blue-500 bg-blue-50 dark:bg-blue-950':'border-slate-200 dark:border-slate-700'}`}><input type="radio" name="workspace-branch" disabled={busy} checked={selected===b.id} onChange={()=>setSelected(b.id)}/><span className="flex-1">{b.name}</span>{b.id===p.branchId&&<span className="flex items-center gap-1 text-xs text-blue-600"><Check size={13}/>Current</span>}</label>)}</div>
        {error&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setOpen(false)} className="rounded-xl border px-4 py-2">Cancel</button><button type="button" disabled={busy||selected===p.branchId} onClick={()=>void requestSwitch(selected)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy&&<Loader2 size={16} className="animate-spin"/>}Switch workspace</button></div>
      </div>
    </dialog>
    <dialog ref={staleDialog} onCancel={e=>e.preventDefault()} aria-label="Workspace changed" className="m-auto w-[min(94vw,500px)] rounded-2xl border-0 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
      <AlertTriangle className="text-amber-500"/><h2 className="my-3 text-lg font-bold">Workspace changed</h2><p role="alert" className="text-sm">{stale}</p><p className="mt-3 text-sm text-slate-500">The old screen is blocked to avoid mixing branch data. Pending checkout requests remain stored for recovery.</p><button type="button" className="mt-5 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" onClick={reload}>Reload workspace</button>
    </dialog>
  </Context.Provider>;
}
