'use client';
import {useState} from 'react';
import {saveTaxRate} from './tax-actions';

export function TaxForm({businessId,branchId,taxRate}:{businessId:string;branchId:string;taxRate:number}){
  const [value,setValue]=useState(String(taxRate)),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <form className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setMessage('');try{await saveTaxRate(businessId,branchId,Number(value));setMessage('Tax saved for this branch. Web and mobile checkout use this rate.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}}>
    <label className="block font-medium">Tax %<input required type="number" inputMode="decimal" min="0" max="100" step="0.01" value={value} disabled={busy} onChange={event=>setValue(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2.5 dark:border-slate-700"/></label>
    <p className="text-sm text-slate-500">Applies to new POS sales in this branch on web and mobile. Existing orders keep their original tax.</p>
    {!!message&&<p role="status">{message}</p>}<button disabled={busy} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{busy?'Saving…':'Save tax rate'}</button>
  </form>;
}
