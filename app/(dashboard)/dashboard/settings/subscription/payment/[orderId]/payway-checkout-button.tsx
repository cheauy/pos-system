'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowRight, X } from 'lucide-react';
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
  return <><button type="button" disabled={pending} onClick={start} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-50"><Image src="/aba-khqr.png" alt="" width={28} height={28} className="shrink-0 rounded-md object-contain"/>{pending?'Opening checkout…':'Checkout with ABA PayWay'}<ArrowRight size={17}/></button>{error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{checkout&&<PaywayPopup orderId={orderId} kind={kind} checkout={checkout} onClose={()=>{setCheckout(null);router.refresh();}}/>}</>;
}

function PaywayPopup({orderId,checkout,onClose,kind}:{orderId:string;checkout:Checkout;onClose:()=>void;kind:'subscription'|'business_change'}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const form=useRef<HTMLFormElement>(null);
  const submitted=useRef(false);
  const [checking,setChecking]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    const element=dialog.current;
    const previous=document.activeElement as HTMLElement|null;
    element?.showModal();
    if(!submitted.current){submitted.current=true;form.current?.submit();}
    return ()=>{element?.close();previous?.focus();};
  },[]);
  async function check() {
    setChecking(true);
    try {
      const result=await checkPaywayPopup(orderId,kind);
      if(result.state==='approved'){onClose();return;}
      setMessage(result.error??(result.state==='late_payment_review'?'Payment received after expiry. Please contact support for review.':'Payment is not confirmed yet. Please check again after paying.'));
    } catch {setMessage('Unable to check payment. Please try again.');}
    finally {setChecking(false);}
  }
  return <dialog ref={dialog} aria-label="ABA PayWay checkout" onCancel={event=>{event.preventDefault();onClose();}} className="fixed inset-0 m-auto h-[min(94dvh,860px)] max-h-[94dvh] w-[min(96vw,480px)] overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/60 open:flex open:flex-col">
    <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3"><h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Image src="/aba-khqr.png" alt="" width={32} height={32} className="rounded-lg object-contain"/>ABA PayWay</h2><button aria-label="Close payment popup" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></header>
    <iframe name={`payway-${orderId}`} title="Secure ABA KHQR payment" className="min-h-0 w-full flex-1 border-0 bg-white" sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"/>
    <form ref={form} method="POST" action={checkout.purchaseUrl} target={`payway-${orderId}`} hidden>{Object.entries(checkout.fields).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}</form>
    <footer className="shrink-0 space-y-2 border-t border-slate-200 px-5 py-3 text-center"><button disabled={checking} onClick={check} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:max-w-sm">{checking?'Checking…':'Check payment'}</button><p role="status" className="mx-auto max-w-xl text-xs leading-relaxed text-slate-500">{message||'You can close and reopen this popup without cancelling your payment.'}</p></footer>
  </dialog>;
}
