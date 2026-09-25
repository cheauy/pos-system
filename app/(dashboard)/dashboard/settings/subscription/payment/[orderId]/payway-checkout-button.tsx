'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { checkPaywayPopup, startPaywayPopup } from './payway-actions';

type Checkout={purchaseUrl:string;fields:Record<string,string>};
export default function PaywayCheckoutButton({orderId,kind='subscription'}:{orderId:string;kind?:'subscription'|'business_change'}) {
  const router=useRouter();
  const [checkout,setCheckout]=useState<Checkout|null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  async function start() {
    if(pending)return;
    setPending(true);setError('');
    try {
      const result=await startPaywayPopup(orderId,kind);
      if(result.error)setError(result.error);
      else if(result.checkout?.alreadyPaid)router.refresh();
      else if(result.checkout)setCheckout(result.checkout);
    } catch {setError('Unable to open checkout. Please try again.');}
    finally {setPending(false);}
  }
  return <><button type="button" disabled={pending} onClick={start} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-50"><Image src="/aba-khqr.png" alt="" width={28} height={28} className="shrink-0 rounded-md object-contain"/>{pending?'Opening checkout…':'Checkout with ABA PayWay'}{pending?<Loader2 size={17} className="animate-spin"/>:<ArrowRight size={17}/>}</button>{error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{checkout&&<PaywayPopup orderId={orderId} kind={kind} checkout={checkout} onClose={()=>{setCheckout(null);router.refresh();}}/>}</>;
}

export function PaywayPopup({orderId,checkout,onClose,kind}:{orderId:string;checkout:Checkout;onClose:()=>void;kind:'subscription'|'business_change'}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const form=useRef<HTMLFormElement>(null);
  const submitted=useRef(false);
  const [checking,setChecking]=useState(true);
  const [message,setMessage]=useState('');
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;},[onClose]);
  useEffect(()=>{
    const element=dialog.current;
    const previous=document.activeElement as HTMLElement|null;
    element?.showModal();
    if(!submitted.current){submitted.current=true;form.current?.submit();}
    return ()=>{element?.close();previous?.focus();};
  },[]);
  useEffect(()=>{
    if(!checking)return;
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    const started=Date.now();
    async function poll(){
      let delay=5000;
      try{
        const result=await checkPaywayPopup(orderId,kind);
        if(stopped)return;
        if(result.state==='approved'||result.state==='not_pending'){close.current();return;}
        if(result.state==='late_payment_review'){
          setMessage('Payment received after expiry. Please contact support for review.');
          setChecking(false);return;
        }
        setMessage(result.error?'Connection interrupted. Retrying automatically…':'Waiting for payment. Scanning the QR code does not complete payment.');
        if(result.error)delay=10000;
      }catch{
        if(stopped)return;
        setMessage('Connection interrupted. Retrying automatically…');delay=10000;
      }
      if(stopped)return;
      if(Date.now()-started>=15*60*1000){setMessage('Automatic checking paused. Retry to check your payment.');setChecking(false);return;}
      timer=setTimeout(poll,delay);
    }
    timer=setTimeout(poll,1000);
    return ()=>{stopped=true;clearTimeout(timer);};
  },[orderId,kind,checking]);
  return <dialog ref={dialog} aria-label="ABA PayWay checkout" onCancel={event=>{event.preventDefault();onClose();}} className="fixed inset-0 m-auto h-[min(94dvh,860px)] max-h-[94dvh] w-[min(96vw,480px)] overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/60 open:flex open:flex-col">
    <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3"><h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Image src="/aba-khqr.png" alt="" width={32} height={32} className="rounded-lg object-contain"/>ABA PayWay</h2><button aria-label="Close payment popup" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></header>
    <iframe name={`payway-${orderId}`} title="Secure ABA KHQR payment" className="min-h-0 w-full flex-1 border-0 bg-white" sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"/>
    <form ref={form} method="POST" action={checkout.purchaseUrl} target={`payway-${orderId}`} hidden>{Object.entries(checkout.fields).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}</form>
    <footer className="shrink-0 space-y-2 border-t border-slate-200 px-5 py-3 text-center"><button disabled={checking} aria-busy={checking} onClick={()=>setChecking(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait sm:max-w-sm">{checking&&<Loader2 size={17} className="animate-spin"/>}{checking?'Checking payment automatically…':'Retry payment check'}</button><p role="status" className="mx-auto max-w-xl text-xs leading-relaxed text-slate-500">{message||'You can close and reopen this popup without cancelling your payment.'}</p></footer>
  </dialog>;
}
