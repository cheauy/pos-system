"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import PrintButton from "./print-button";
import { waitForPrintPreview } from '@/lib/printing/wait-for-preview';
import { preparePrint } from '@/lib/printing/prepare-print';

export type OrderPrintKind = "receipt" | "shipping-label";
export default function OrderPrintPreview({orderId,kind,onClose,direct=false}:{orderId:string;kind:OrderPrintKind;onClose:()=>void;direct?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),frame=useRef<HTMLIFrameElement>(null);
 const pending=useRef<AbortController|null>(null);
 const printed=useRef(false);
 const [loaded,setLoaded]=useState(false),[blocked,setBlocked]=useState(false),[error,setError]=useState('');
 const title=kind==='receipt'?'Receipt':'Shipping label';
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const element=dialog.current;element?.showModal();
  return ()=>{pending.current?.abort();element?.close();if(previous?.isConnected)previous.focus();};
 },[]);
 async function ready(){
  if(printed.current)return;
  pending.current?.abort();
  const controller=new AbortController();pending.current=controller;
  setLoaded(false);setBlocked(false);setError('');
  try{
   const document=frame.current?.contentDocument;
   if(!document)throw new Error('Unable to open the print preview. Close it and try again.');
   if(document.URL==='about:blank')return;
   const content=await waitForPrintPreview(document,kind==='receipt'?'#order-receipt-print-area':'#shipping-label-print-area',controller.signal);
   if(controller.signal.aborted)return;
   const disabled=content.dataset.printDisabled==='true';
   setBlocked(disabled);setLoaded(true);setError('');
   if(direct&&!disabled){
    const printWindow=frame.current?.contentWindow;
    if(!printWindow)throw new Error('Unable to open the print preview. Close it and try again.');
    await preparePrint(document,kind==='receipt'?'#order-receipt-print-area':'#shipping-label-print-area');
    if(controller.signal.aborted||frame.current?.contentWindow!==printWindow)return;
    printed.current=true;
    printWindow.addEventListener('afterprint',onClose,{once:true,signal:controller.signal});
    printWindow.focus();printWindow.print();
   }
  }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Unable to load the print preview. Close it and try again.');}
 }
 const printFrame=<iframe ref={frame} title={`${title} ${direct?'print document':'preview'}`} aria-hidden={direct||undefined} tabIndex={direct?-1:undefined} src={`/dashboard/orders/${encodeURIComponent(orderId)}/${kind}?preview=1`} onLoad={ready} onError={()=>setError('Unable to load the print preview. Close it and try again.')} className={direct?'fixed -left-[10000px] top-0 h-[900px] w-[760px] border-0':`min-h-0 w-full flex-1 border-0 bg-white ${loaded?'':'invisible'}`}/>;
 if(direct)return <div className="no-print mt-3 text-sm">
  {!error&&!blocked&&<p role="status" className="flex items-center justify-center gap-2 text-slate-500"><Loader2 size={18} className="animate-spin" aria-hidden="true"/>Preparing print…</p>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {blocked&&<p role="alert" className="text-amber-800">Add the customer’s delivery address before printing this shipping label.</p>}
  <button type="button" onClick={onClose} className="mt-2 rounded-lg border px-3 py-2">{error||blocked?'Close':'Cancel'}</button>
  {printFrame}
 </div>;
 return createPortal(<dialog ref={dialog} aria-label={`${title} preview`} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}} className="fixed inset-0 m-auto h-[min(90dvh,900px)] w-[min(94vw,760px)] max-w-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 open:flex open:flex-col">
  <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4"><h2 className="pt-2 text-lg font-bold">{title}</h2><div className="flex items-start gap-3"><PrintButton label="Print" frame={frame} selector={kind==='receipt'?'#order-receipt-print-area':'#shipping-label-print-area'} disabled={!loaded||blocked||!!error} onPrinted={onClose}/><button type="button" aria-label="Close print preview" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={22}/></button></div></header>
  {!loaded&&!error&&<p role="status" className="flex items-center justify-center gap-2 p-4 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/>Loading preview…</p>}
  {error&&<p role="alert" className="p-4 text-sm text-red-700">{error}</p>}
  {blocked&&<p role="alert" className="p-4 text-sm text-amber-800">Add the customer’s delivery address before printing this shipping label.</p>}
  {printFrame}{/* The frame first paints the dashboard shell and loading skeleton; show it only once the paper is ready. */}
 </dialog>,document.body);
}
