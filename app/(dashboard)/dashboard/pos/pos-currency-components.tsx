'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { CurrencyQuote } from './pos-workspace-types';
import { currencySymbol, displayAmount, formatCurrency, parseMoneyEntry } from './pos-currency';
import s from './pos-workspace.module.css';

export function CurrencyAmountInput({ value, onChange, quote, label, suffix, onError, placeholder, disabled = false }: {
  value: string; onChange:(value:string)=>void; quote:CurrencyQuote; label:string;
  suffix?:ReactNode; onError?:(error:string|null)=>void; placeholder?:number; disabled?:boolean;
}) {
  const shown = value === '' ? '' : String(displayAmount(Number(value),quote));
  const [raw,setRaw] = useState(shown);
  const [error,setError] = useState<string|null>(null);
  useEffect(() => { setRaw(shown); setError(null); onError?.(null); }, [shown,quote.displayCurrency,quote.usdKhrRate,quote.baseCurrency]); // callback is intentionally not a reset trigger
  useEffect(() => () => { onError?.(null); }, []);
  return <div className={s.currencyEntry}>
    <div className={s.amountWithSuffix}>
      <input aria-label={label} aria-invalid={Boolean(error)} inputMode="decimal" type="text" value={raw} disabled={disabled}
        placeholder={placeholder === undefined ? undefined : String(displayAmount(placeholder,quote))}
        onChange={e => { const next=e.target.value;setRaw(next);const result=parseMoneyEntry(next,quote);setError(result.error);onError?.(result.error);if(!result.error)onChange(result.value); }}/>
      {suffix || <span className={s.moneySuffix}>{currencySymbol(quote.displayCurrency)}</span>}
    </div>
    {error ? <small role="alert" className={s.orangeText}>{error}</small> : quote.displayCurrency !== quote.baseCurrency && raw !== '' ? <small>Recorded as {formatCurrency(Number(value || 0),quote.baseCurrency)}</small> : null}
  </div>;
}

export function CurrencySwitch({ quote, onChange, disabled=false }: { quote:CurrencyQuote;onChange:(currency:string)=>void;disabled?:boolean }) {
  if (!quote.enabled) return null;
  return <div className={s.currencySwitch} role="group" aria-label="POS currency">
    {(['USD','KHR'] as const).map(code=><button type="button" key={code} aria-label={code === 'USD' ? 'Use US dollars' : 'Use Cambodian riel'} aria-pressed={quote.displayCurrency===code} disabled={disabled} className={quote.displayCurrency===code?s.currencyActive:''} onClick={()=>onChange(code)}>{currencySymbol(code)}</button>)}
  </div>;
}
