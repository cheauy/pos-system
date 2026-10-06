"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
import {createPortal} from "react-dom";
import dynamic from "next/dynamic";
import {X} from "lucide-react";
import {getPurchaseOrderChoices} from "./actions";

function LoadingForm() { return <div role="status" aria-label="Loading purchase order" className="animate-pulse space-y-4 p-5"><div className="h-8 w-56 rounded-lg bg-slate-100"/><div className="h-36 rounded-xl bg-slate-100"/><div className="h-64 rounded-xl bg-slate-100"/></div>; }
const PurchaseOrderForm=dynamic(()=>import("./new/purchase-order-form"),{loading:LoadingForm});
type Choices=Awaited<ReturnType<typeof getPurchaseOrderChoices>>;
export type ChoicesCache={at:number;request:Promise<Choices>}|null;
// Reopening within a minute reuses the catalog; the server re-checks products and supplier on save.
const CHOICES_TTL=60_000;

export default function NewOrderDialog({close,created,cacheRef}:{close:()=>void;created:(id:string)=>void;cacheRef:RefObject<ChoicesCache>}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [choices,setChoices]=useState<Choices|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  useEffect(()=>{let active=true;setError("");const cached=cacheRef.current;if(!cached||Date.now()-cached.at>CHOICES_TTL)cacheRef.current={at:Date.now(),request:getPurchaseOrderChoices()};const request=cacheRef.current!.request;request.catch(()=>{if(cacheRef.current?.request===request)cacheRef.current=null;});request.then(data=>{if(active)setChoices(data);}).catch(error=>{if(active)setError(error instanceof Error?error.message:"Unable to load purchase order.");});return()=>{active=false;};},[attempt,cacheRef]);
  return createPortal(<dialog ref={dialog} aria-label="New Purchase Order" onCancel={event=>{event.preventDefault();if(!busy)close();}} onClick={event=>{if(busy||event.target!==event.currentTarget)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}}
    style={{position:"fixed",inset:0,margin:"auto",width:"min(1050px, calc(100vw - 2rem))",maxWidth:"calc(100vw - 2rem)",maxHeight:"92dvh",height:"fit-content"}}
    className="overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/30">
    <div className="sticky top-0 z-10 flex justify-end border-b border-slate-200 bg-white px-3 py-2"><button type="button" disabled={busy} onClick={close} aria-label="Close new purchase order" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"><X size={20}/></button></div>
    {error?<div role="alert" className="p-5 text-sm text-red-700">{error}<button type="button" onClick={()=>setAttempt(value=>value+1)} className="ml-3 font-semibold underline">Try again</button></div>:choices?<div className="p-4 sm:p-5"><PurchaseOrderForm {...choices} onCreated={created} onBusyChange={setBusy}/></div>:<LoadingForm/>}
  </dialog>,document.body);
}
