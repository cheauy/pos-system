'use client';
import { useState } from 'react';
import { Save } from 'lucide-react';
import { saveStoreCurrencySettings } from './pos-workspace-actions';
import { currencyFormat, formatStoreMoney, type CurrencyFormat } from '@/lib/currency-format';
import type { PosSettings } from './pos-workspace-types';

export function PosCurrencySettings({ businessId, settings }: { businessId:string;settings:PosSettings }) {
  const [currency,setCurrency]=useState(settings.currency || 'USD');
  const [rate,setRate]=useState(String(settings.usdKhrRate ?? 4000));
  const [format,setFormat]=useState(currencyFormat(settings.currencyFormat,settings.currency));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [saved,setSaved]=useState(false);
  const field='mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950';
  function update(next: Partial<CurrencyFormat>) {setFormat({...format,...next});setSaved(false);setMessage('');}
  async function save() {
    if(busy)return;setBusy(true);setMessage('');setSaved(false);
    try {
      const result=await saveStoreCurrencySettings(businessId,currency,Number(rate),format);
      if(!result.success){setMessage(result.message);return;}
      setSaved(true);setMessage('Currency settings saved. POS will use your updated format.');
      try {const channel=new BroadcastChannel(`tenh-pos-currency:${businessId}`);channel.postMessage('saved');channel.close();localStorage.setItem(`tenh-pos-currency:${businessId}`,String(Date.now()));} catch { /* Open POS tabs also refresh on focus. */ }
    } catch {setMessage('Unable to confirm the save. Please refresh settings before retrying.');}
    finally {setBusy(false);}
  }
  return <form onSubmit={event=>{event.preventDefault();void save();}} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 dark:border-slate-800 dark:bg-slate-900">
    <fieldset disabled={busy} className="space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-slate-800"><h2 className="font-bold">Currency settings</h2><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Active</span></div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <label className="text-sm font-medium">Store currency<select className={field} value={currency} onChange={e=>{setCurrency(e.target.value);update({symbol:e.target.value==='KHR'?'៛':'$'});}}><option value="USD">🇺🇸 USD — US Dollar</option><option value="KHR">🇰🇭 KHR — Cambodian Riel</option></select><span className="mt-2 block text-xs font-normal text-slate-500">USD by default. Existing prices and orders keep their accounting currency.</span></label>
        <label className="text-sm font-medium">Currency symbol<input required maxLength={8} className={field} value={format.symbol} onChange={e=>update({symbol:e.target.value})}/></label>
        <label className="text-sm font-medium">Position<select className={field} value={format.position} onChange={e=>update({position:e.target.value as CurrencyFormat['position']})}><option value="before">Before amount ($10.00)</option><option value="after">After amount (10.00 $)</option></select></label>
      </div>
      <div className="border-t border-slate-100 pt-5 dark:border-slate-800"><label className="text-sm font-semibold" htmlFor="currency-rate">Exchange rate</label><div className="mt-2 flex max-w-sm items-center gap-3"><span className="shrink-0 text-sm">1 USD =</span><input id="currency-rate" required type="number" min="1" max="1000000" step="0.0001" className={field} value={rate} onChange={e=>{setRate(e.target.value);setSaved(false);setMessage('');}}/><span className="text-sm">KHR</span></div><p className="mt-2 text-xs text-slate-500">Default: 1 USD = 4,000 KHR. This is your manual store rate, not a live bank rate.</p></div>
      <details open className="border-t border-slate-100 pt-5 dark:border-slate-800"><summary className="cursor-pointer text-sm font-bold">Advanced options</summary><div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">Decimal precision<select className={field} value={format.decimals} onChange={e=>update({decimals:Number(e.target.value) as CurrencyFormat['decimals']})}><option value={0}>0 (0)</option><option value={2}>2 (0.00)</option><option value={3}>3 (0.000)</option></select></label>
        <label className="text-sm font-medium">Rounding method<select className={field} value={format.rounding} onChange={e=>update({rounding:e.target.value as CurrencyFormat['rounding']})}><option value="half-up">Standard (Half up)</option><option value="up">Round up</option><option value="down">Round down</option></select></label>
        <label className="text-sm font-medium">Display format<select className={field} value={format.format} onChange={e=>update({format:e.target.value as CurrencyFormat['format']})}><option value="en-US">1,000.00</option><option value="de-DE">1.000,00</option><option value="fr-FR">1 000,00</option></select></label>
      </div><p className="mt-3 text-xs text-slate-500">Display formatting only. Payments and saved sales retain their accounting precision.</p></details>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Preview</p><output className="mt-1 block text-2xl font-bold text-emerald-950 dark:text-emerald-100">{formatStoreMoney(1234.56,format)}</output></div>
      {message && <p role={saved?'status':'alert'} className={`text-sm ${saved?'text-emerald-700':'text-red-600'}`}>{message}</p>}
      <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"><Save size={17}/>{busy?'Saving…':'Save currency settings'}</button>
    </fieldset>
  </form>;
}
