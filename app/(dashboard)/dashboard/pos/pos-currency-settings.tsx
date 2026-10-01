'use client';
import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight, BadgeDollarSign, FileText, Info, RotateCcw, Save, ShoppingCart, SlidersHorizontal, Tag, type LucideIcon } from 'lucide-react';
import { saveStoreCurrencySettings, savePaymentOptions } from './pos-workspace-actions';
import { saveTaxRate } from '../settings/pos-currency/tax-actions';
import { currencyFormat, formatStoreMoney, validCurrencyFormat, type CurrencyFormat } from '@/lib/currency-format';
import { validTaxRate } from '@/lib/pos/tax-rate';
import type { PosSettings } from './pos-workspace-types';
import s from '../settings/pos-currency/currency-settings.module.css';

type Draft = {splitPaymentEnabled:boolean;customerCreditEnabled:boolean;currency:string;rate:string;format:CurrencyFormat;tax:string};
export function PosCurrencySettings({ businessId, branchId, settings }: { businessId:string;branchId:string;settings:PosSettings }) {
  const [baseline,setBaseline]=useState<Draft>({splitPaymentEnabled:settings.splitPaymentEnabled!==false,customerCreditEnabled:settings.customerCreditEnabled!==false,currency:settings.currency||'USD',rate:String(settings.usdKhrRate??4000),format:currencyFormat(settings.currencyFormat,settings.currency),tax:String(settings.taxRate??0)});
  const [draft,setDraft]=useState(baseline);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false);
  const locked=useRef(false);
  const {currency,rate,format,tax}=draft;
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
  function change(patch:Partial<Draft>){setDraft(current=>({...current,...patch}));setSaved(false);setMessage('');}
  function update(patch:Partial<CurrencyFormat>){change({format:{...format,...patch}});}
  function notifyPos(){try{const channel=new BroadcastChannel(`tenh-pos-currency:${businessId}`);channel.postMessage('saved');channel.close();localStorage.setItem(`tenh-pos-currency:${businessId}`,String(Date.now()));}catch{/* POS also refreshes on focus. */}}
  async function save(){
    if(locked.current)return;
    if(!validCurrencyFormat(format)||!rate.trim()||!Number.isFinite(Number(rate))||Number(rate)<1||Number(rate)>1000000||!tax.trim()||!validTaxRate(Number(tax))){setSaved(false);setMessage('Review the currency format, exchange rate and tax percentage.');return;}
    locked.current=true;setBusy(true);setMessage('');setSaved(false);
    let currencySaved=false, savingPayments=false;
    try{
      const currencyChanged=currency!==baseline.currency||rate!==baseline.rate||JSON.stringify(format)!==JSON.stringify(baseline.format);
      if(currencyChanged){
        const result=await saveStoreCurrencySettings(businessId,currency,Number(rate),format,branchId);
        if(!result.success){setMessage(result.message);return;}
        currencySaved=true;setBaseline(current=>({...current,currency,rate,format}));notifyPos();
      }
      if(tax!==baseline.tax){await saveTaxRate(businessId,branchId,Number(tax));setBaseline(current=>({...current,tax}));}
      if(draft.splitPaymentEnabled!==baseline.splitPaymentEnabled||draft.customerCreditEnabled!==baseline.customerCreditEnabled){
        savingPayments=true;
        const result=await savePaymentOptions(businessId,branchId,draft.splitPaymentEnabled,draft.customerCreditEnabled);
        if(!result.success){setMessage(`Payment settings were not saved. ${result.message}`);return;}
      }
      setBaseline(draft);setSaved(true);setMessage('Currency, tax and payment settings saved. New POS sales use these settings.');notifyPos();
    }catch(error){setMessage(`${savingPayments?'Payment settings were not confirmed. ':currencySaved?'Currency settings saved, but tax was not confirmed. ':''}${error instanceof Error?error.message:'Unable to confirm the save. Refresh before retrying.'}`);}
    finally{locked.current=false;setBusy(false);}
  }
  const preview=(amount:number)=>formatStoreMoney(amount,format);
  const rateValid=Number.isFinite(Number(rate))&&Number(rate)>=1&&Number(rate)<=1000000;
  const configuration=[['Store currency',currency==='KHR'?'KHR — Cambodian Riel':'USD — US Dollar'],['Currency symbol',format.symbol],['Amount position',format.position==='before'?'Before amount':'After amount'],['Exchange rate',rateValid?`1 USD = ${Number(rate).toLocaleString()} KHR`:'—'],['Decimal precision',String(format.decimals)],['Rounding method',format.rounding==='half-up'?'Standard (Half up)':format.rounding==='up'?'Round up':'Round down'],['Display format',format.format==='en-US'?'1,000.00':format.format==='de-DE'?'1.000,00':'1 000,00'],['Tax percentage',`${tax||0}%`]];
  return <form onSubmit={event=>{event.preventDefault();void save();}} className={s.form}>
    <div className={s.layout}>
      <fieldset disabled={busy} className={s.fields}>
        <Card icon={BadgeDollarSign} title="Store currency" description="Choose your store currency. Existing prices and orders keep their accounting currency.">
          <div className={s.currencyRow}>
            <label>Currency<select value={currency} onChange={e=>change({currency:e.target.value,format:{...format,symbol:e.target.value==='KHR'?'៛':'$'}})}><option value="USD">🇺🇸 USD — US Dollar</option><option value="KHR">🇰🇭 KHR — Cambodian Riel</option></select></label>
            <label>Currency symbol<input required maxLength={8} value={format.symbol} onChange={e=>update({symbol:e.target.value})}/></label>
            <label>Amount position<select value={format.position} onChange={e=>update({position:e.target.value as CurrencyFormat['position']})}><option value="before">Before amount ($10.00)</option><option value="after">After amount (10.00 $)</option></select></label>
          </div>
        </Card>
        <Card icon={ArrowLeftRight} title="Exchange rate" description="This is your manual store rate, not a live bank rate.">
          <label className={s.inlineField}><span>1 USD =</span><span className={s.suffix}><input aria-label="Exchange rate" required type="number" min="1" max="1000000" step="0.0001" value={rate} onChange={e=>change({rate:e.target.value})}/><span>KHR</span></span></label>
        </Card>
        <Card icon={SlidersHorizontal} title="Formatting" description="Control how amounts appear. Saved payments keep their accounting precision.">
          <div className={s.threeColumns}>
            <label>Decimal precision<select value={format.decimals} onChange={e=>update({decimals:Number(e.target.value) as CurrencyFormat['decimals']})}><option value={0}>0 (0)</option><option value={2}>2 (0.00)</option><option value={3}>3 (0.000)</option></select></label>
            <label>Rounding method<select value={format.rounding} onChange={e=>update({rounding:e.target.value as CurrencyFormat['rounding']})}><option value="half-up">Standard (Half up)</option><option value="up">Round up</option><option value="down">Round down</option></select></label>
            <label>Display format<select value={format.format} onChange={e=>update({format:e.target.value as CurrencyFormat['format']})}><option value="en-US">1,000.00</option><option value="de-DE">1.000,00</option><option value="fr-FR">1 000,00</option></select></label>
          </div>
        </Card>
        <Card icon={FileText} title="Tax settings" description="Applies to new POS sales in this branch on web and mobile. Existing orders keep their original tax.">
          <label className={s.inlineField}><span>Tax percentage</span><span className={s.suffix}><input aria-label="Tax percentage" required type="number" min="0" max="100" step="0.01" value={tax} onChange={e=>change({tax:e.target.value})}/><span>%</span></span></label>
        </Card>
        <Card icon={SlidersHorizontal} title="Payment options" description="Choose the payment methods available for new POS sales in this branch.">
          {([{key:'splitPaymentEnabled',label:'Split payment'},{key:'customerCreditEnabled',label:'Customer credit'}] as const).map(({key,label})=><label key={key} className={s.toggleRow}><span>{label}</span><span className={s.toggleControl}><input aria-label={label} type="checkbox" role="switch" checked={draft[key]} onChange={event=>change({[key]:event.target.checked})} className={s.toggleInput}/><span className={s.toggleTrack} aria-hidden="true"/><span className={s.toggleState} aria-hidden="true">{draft[key]?'On':'Off'}</span></span></label>)}
        </Card>
      </fieldset>
      <aside className={s.preview} aria-label="Currency preview">
        <div className={s.previewTop}>
          <span className={s.badge}>{dirty?'Unsaved preview':'Current settings'}</span>
          <h2>Live preview</h2><p>How your prices will appear in this branch.</p>
          <Preview icon={ShoppingCart} title="Product price (example)" description={`An amount of 1,234.56 ${currency}`} value={preview(1234.56)}/>
          <Preview icon={Tag} title="Smaller amount" description={`An amount of 18.00 ${currency}`} value={preview(18)}/>
          <Preview icon={ArrowLeftRight} title="In local currency" description={rateValid?`1 USD = ${Number(rate).toLocaleString()} KHR`:'Enter a valid exchange rate'} value={rateValid?`KHR ${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(18*Number(rate))}`:'—'} note="for 18.00 USD"/>
          <div className={s.info}><Info size={18}/><p>The manual exchange rate is used for display and store operations.</p></div>
        </div>
        <div className={s.configuration}><h3>{dirty?'Preview configuration':'Current configuration'}</h3><dl>{configuration.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></div>
      </aside>
    </div>
    <footer className={s.footer}>
      {message&&<p role={saved?'status':'alert'} className={`${s.message} ${saved?s.success:s.error}`}>{message}</p>}
      <button type="button" className={s.secondary} disabled={busy} onClick={()=>change({splitPaymentEnabled:true,customerCreditEnabled:true,currency:'USD',rate:'4000',format:currencyFormat(null,'USD'),tax:'0'})}><RotateCcw size={16}/>Reset to defaults</button>
      <div className={s.footerRight}><button type="button" disabled={busy||!dirty} className={s.secondary} onClick={()=>{setDraft(baseline);setMessage('');setSaved(false);}}>Cancel</button><button type="submit" disabled={busy||!dirty} className={s.primary}><Save size={16}/>{busy?'Saving…':'Save currency settings'}</button></div>
    </footer>
  </form>;
}
function Card({icon:Icon,title,description,children}:{icon:LucideIcon;title:string;description:string;children:ReactNode}){return <section className={s.card}><div className={s.cardHeading}><span className={s.icon}><Icon size={23}/></span><div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>;}
function Preview({icon:Icon,title,description,value,note}:{icon:LucideIcon;title:string;description:string;value:string;note?:string}){return <div className={s.example}><span className={s.icon}><Icon size={21}/></span><div className={s.exampleText}><h3>{title}</h3><p>{description}</p></div><div className={s.amount}><output>{value}</output>{note&&<small>{note}</small>}</div></div>;}
