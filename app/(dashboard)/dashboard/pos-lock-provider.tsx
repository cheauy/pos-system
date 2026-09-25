'use client';
import Link from 'next/link';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { posLockAllows } from '@/lib/pos/navigation-lock';
import { readPosNavigationLock, setPosNavigationLock } from './pos-lock-actions';

const Context=createContext({locked:false,pending:false,toggle:async()=>{}});
export const usePosNavigationLock=()=>useContext(Context);
export default function PosLockProvider({businessId,userId,branchId,initialLocked,children}:{businessId:string;userId:string;branchId:string;initialLocked:boolean;children:ReactNode}){
  const [locked,setLocked]=useState(initialLocked),[pending,setPending]=useState(false);
  const changing=useRef(false);
  const router=useRouter(),pathname=usePathname();
  const signalKey=`tenh-pos-lock:${businessId}:${userId}`;
  useEffect(()=>{
    let live=true;
    const sync=async()=>{if(changing.current||document.visibilityState!=='visible')return;try{const result=await readPosNavigationLock(businessId);if(live&&!changing.current)setLocked(result.locked);}catch{/* Do not unlock on a network failure. */}};
    const storage=(event:StorageEvent)=>{if(event.key===signalKey)void sync();};
    window.addEventListener('focus',sync);window.addEventListener('storage',storage);
    return()=>{live=false;window.removeEventListener('focus',sync);window.removeEventListener('storage',storage);};
  },[businessId,signalKey]);
  useEffect(()=>{
    if(locked&&!posLockAllows(pathname))router.replace('/dashboard/pos');
  },[locked,pathname,router]);
  useEffect(()=>{
    if(!locked)return;
    const block=(event:MouseEvent)=>{
      const link=(event.target as Element)?.closest?.('a[href]');
      if(!link)return;
      const url=new URL(link.getAttribute('href')??'',window.location.href);
      if(url.origin===window.location.origin&&url.pathname.startsWith('/dashboard')&&!posLockAllows(url.pathname)){
        event.preventDefault();event.stopImmediatePropagation();toast.info('POS is locked. Unlock it to open other menus.');
      }
    };
    document.addEventListener('click',block,true);document.addEventListener('auxclick',block,true);
    return()=>{document.removeEventListener('click',block,true);document.removeEventListener('auxclick',block,true);};
  },[locked]);
  async function toggle(){
    if(changing.current)return;changing.current=true;setPending(true);
    try{const result=await setPosNavigationLock(businessId,branchId,!locked);setLocked(result.locked);try{localStorage.setItem(signalKey,String(Date.now()));}catch{/* Cookie remains authoritative. */}}
    catch(error){toast.error(error instanceof Error?error.message:'Unable to change POS lock.');}
    finally{changing.current=false;setPending(false);}
  }
  return <Context.Provider value={{locked,pending,toggle}}>{locked&&<div role="status" className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 lg:pl-20"><LockKeyhole size={15}/><strong>POS locked</strong><span>POS, Orders and Register remain available.</span>{pathname!=='/dashboard/pos'&&<Link href="/dashboard/pos" className="ml-auto font-semibold underline">Back to POS</Link>}</div>}{locked&&!posLockAllows(pathname)?<p className="p-6 lg:pl-20">Returning to locked POS…</p>:children}</Context.Provider>;
}
