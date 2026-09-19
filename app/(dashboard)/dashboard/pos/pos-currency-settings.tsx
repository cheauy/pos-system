'use client';
import { useState } from 'react';
import { savePosCurrencySettings } from './pos-workspace-actions';
import type { PosSettings } from './pos-workspace-types';
import s from './pos-workspace.module.css';

export function PosCurrencySettings({ businessId, settings, onSaved, onBusyChange }: { businessId:string;settings:PosSettings;onSaved?:()=>void;onBusyChange?:(busy:boolean)=>void }) {
  const [enabled,setEnabled]=useState(settings.dualCurrencyEnabled === true);
  const [rate,setRate]=useState(String(settings.usdKhrRate ?? 4000));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  const supported=['USD','KHR'].includes(settings.currency);
  async function save() {
    if(busy)return;setBusy(true);onBusyChange?.(true);setError('');setSaved(false);
    try {
      const result=await savePosCurrencySettings(businessId,enabled,Number(rate));
      if(!result.success){setError(result.message);return;}
      setSaved(true);
      try { const channel=new BroadcastChannel(`tenh-pos-currency:${businessId}`);channel.postMessage('saved');channel.close(); } catch { /* Focus/storage fallback. */ }
      try { localStorage.setItem(`tenh-pos-currency:${businessId}`,String(Date.now())); } catch { /* Settings remain saved on the server. */ }
      onSaved?.();
    } catch {setError('Currency settings could not be confirmed. Refresh Settings before retrying.');}
    finally {setBusy(false);onBusyChange?.(false);}
  }
  return <fieldset className={s.flowFieldset} disabled={busy}><div className={s.stack}>
    <p className={s.paymentInfo}>The store’s accounting currency stays <strong>{settings.currency}</strong>. The switch changes POS display and amount entry, not saved product prices or completed sales.</p>
    <label className={s.confirmation}><input type="checkbox" aria-label="Enable USD and KHR" checked={enabled} disabled={!supported} onChange={e=>{setEnabled(e.target.checked);setSaved(false);}}/><span>Enable $ / ៛ currency switch in Point of Sale</span></label>
    {!supported && <p className={s.orangeText}>USD / KHR switching is available only when the store’s accounting currency is USD or KHR.</p>}
    <label className={s.field}>Exchange rate<div className={s.exchangeInput}><strong>$1 =</strong><input aria-label="Riel per US dollar" inputMode="decimal" type="number" min="1" max="1000000" step="0.0001" value={rate} onChange={e=>{setRate(e.target.value);setSaved(false);}}/><strong>៛</strong></div><small>Default: $1 = 4,000៛. This is your manually configured store rate, not a live bank rate.</small></label>
    <p className={s.muted}>Saving updates open POS tabs on this browser and is checked again at checkout. Cashiers must review payment after a rate change. Completed orders keep their original rate snapshot.</p>
    <p className={s.muted}>Amounts are recorded at the existing accounting precision (2 decimals). A foreign-currency entry that cannot be represented at that precision is rejected instead of silently changing the amount.</p>
    {error && <p role="alert" className={s.orangeText}>{error}</p>}{saved && <p role="status" className={s.blueText}>Currency settings saved.</p>}
    <button type="button" className={s.primary} onClick={save} disabled={busy || !supported}>{busy?'Saving…':'Save currency settings'}</button>
  </div></fieldset>;
}
