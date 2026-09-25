'use client';

import { useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useFormStatus } from 'react-dom';
import { Building2, ShieldCheck } from 'lucide-react';
import { selectSubscriptionPaymentMethod } from '../../actions';
import PaywayCheckoutButton from './payway-checkout-button';

// Choosing a card is local only. The explicit checkout action commits a route.
export default function PaymentMethodSelector({orderId,manualAvailable,initialMethod,kind='subscription',manualContent}:{orderId:string;manualAvailable:boolean;initialMethod:'payway'|'manual'|null;kind?:'subscription'|'business_change';manualContent?:ReactNode}) {
  const [method,setMethod]=useState(initialMethod==='manual'&&!manualAvailable?null:initialMethod);
  const manualDialog=useRef<HTMLDialogElement>(null);
  return <div className="mt-4 space-y-4">
    <div role="group" aria-label="Payment method" className="grid gap-2">
      {(['payway','manual'] as const).filter(value=>value==='payway'||manualAvailable).map(value=><button key={value} type="button" aria-pressed={method===value} onClick={()=>setMethod(value)} className={`flex min-h-[72px] w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${method===value?'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500 dark:bg-blue-950/30 dark:text-blue-300':'border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${method===value?'border-blue-600':'border-slate-300'}`}>{method===value&&<span className="h-2.5 w-2.5 rounded-full bg-blue-600"/>}</span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800">{value==='payway'?<Image src="/aba-khqr.png" alt="" width={40} height={40} className="rounded-lg object-contain"/>:<Building2 size={20}/>}</span>
        <span><span className="block text-sm font-bold">{value==='payway'?'ABA PayWay':'Manual payment'}</span><span className="mt-0.5 block text-xs opacity-75">{value==='payway'?'Scan KHQR to pay':'Bank transfer with receipt'}</span></span>
      </button>)}
    </div>
    {method==='payway'&&<PaywayCheckoutButton orderId={orderId} kind={kind}/>}
    {method==='manual'&&(kind==='business_change'?<><button type="button" onClick={()=>manualDialog.current?.showModal()} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Continue with manual payment</button><dialog ref={manualDialog} aria-label="Manual payment" className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,680px)] overflow-auto rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-white"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Manual payment</h2><button type="button" onClick={()=>manualDialog.current?.close()} className="rounded-lg border px-3 py-1 text-sm">Close</button></div>{manualContent}</dialog></>:<form action={selectSubscriptionPaymentMethod}><input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="paymentMethod" value="manual"/><ManualContinue/></form>)}
    <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0"/>Choose a method, then continue when you are ready to pay.</p>
  </div>;
}
function ManualContinue(){
  const {pending}=useFormStatus();
  return <button disabled={pending} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{pending?'Opening bank details…':'Continue with manual payment'}</button>;
}
