 'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ImagePlus, Save } from 'lucide-react';
import { PosReceipt } from '@/components/receipts/pos-receipt';
import { ReceiptViewer } from '@/components/receipts/receipt-viewer';
import { receiptSample, receiptSettingsIssue, type ReceiptAppearance, type ReceiptContext } from '@/lib/receipts/receipt-model';
import { saveReceiptAppearance, uploadReceiptLogo } from './actions';
import s from './receipt-settings.module.css';
const TOGGLES: Array<[keyof ReceiptAppearance,string]>=[['showLogo','Logo'],['showPhone','Business phone'],['showAddress','Store address'],['showCustomer','Customer'],['showDiscount','Discount'],['showPayment','Payment details'],['showFulfillment','Order type and delivery'],['showNotes','Order notes'],['showOrderNumber','Order number'],['showLoyalty','Loyalty points'],['showCashier','Cashier, when recorded']];
export function ReceiptSettingsEditor({businessId,initial}:{businessId:string;initial:ReceiptContext}) {
 const [a,setA]=useState(initial.appearance);const [busy,setBusy]=useState('');const [message,setMessage]=useState('');const [saved,setSaved]=useState(initial.appearance);
 const sample=receiptSample(initial.store.name);const context={...initial,appearance:a};
 async function save(){const issue=receiptSettingsIssue(a);if(issue){setMessage(issue);return;}setBusy('save');setMessage('');try{const r=await saveReceiptAppearance(businessId,a);if(r.success){setSaved(a);setMessage('Receipt settings saved. Actual receipt views will use this design.');}else setMessage(r.message);}catch{setMessage('Save could not be confirmed. Reopen settings to check before trying again.');}finally{setBusy('');}}
 async function upload(file:File | undefined){if(!file)return;setBusy('upload');setMessage('');try{const form=new FormData();form.set('logo',file);const r=await uploadReceiptLogo(businessId,form);if(r.success){setA(p=>({...p,logoUrl:r.url,showLogo:true}));setMessage('Logo uploaded. Save receipt settings to apply it.');}else setMessage(r.message);}catch{setMessage('Logo upload failed. Please retry.');}finally{setBusy('');}}
 return <div className={s.page}>
 <header><h1>Receipt settings</h1><p>Choose a template, add your logo, and preview the same layout used by View receipt.</p><nav><Link href="/dashboard/barcodes">Barcode labels</Link><Link href="/dashboard/shipping-labels">Shipping labels</Link></nav></header>
 {message && <p role="status" className={s.notice}>{message}</p>}
 <div className={s.layout}><section className={s.card}><fieldset disabled={!!busy} className={s.fields}>
 <h2>Template and paper</h2><div className={s.templates}>{(['classic','compact','minimal'] as const).map(t=><button type="button" key={t} aria-pressed={a.template===t} className={a.template===t?s.active:''} onClick={()=>setA(p=>({...p,template:t}))}><strong>{t[0].toUpperCase()+t.slice(1)}</strong><span>{t==='classic'?'Centered shop header':t==='compact'?'Closer spacing':'Left-aligned, simple'}</span></button>)}</div>
 <label>Paper width<select value={a.paperSize} onChange={e=>setA(p=>({...p,paperSize:e.target.value as ReceiptAppearance['paperSize']}))}><option value="80mm">80 mm</option><option value="58mm">58 mm</option></select></label>
 <h2>Receipt logo</h2><p className={s.muted}>This logo is for receipts only. Your storefront logo is not changed. Uploaded logos are public branding assets.</p>
 <label className={s.upload}><ImagePlus size={18}/> Upload PNG / JPEG / WebP · max 750 KB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label>
 <label>Image URL or public path<input value={a.logoUrl || ''} placeholder="/my-receipt-logo.png" onChange={e=>setA(p=>({...p,logoUrl:e.target.value || null}))}/></label>
 <button type="button" onClick={()=>setA(p=>({...p,logoUrl:null,showLogo:false}))}>Remove receipt logo</button>
 <h2>Text</h2>{([['header','Header text'],['footer','Footer text'],['returnPolicy','Return policy']] as const).map(([key,label])=><label key={key}>{label}<textarea rows={2} maxLength={500} value={a[key]} onChange={e=>setA(p=>({...p,[key]:e.target.value}))}/></label>)}
 <h2>Visible sections</h2><div className={s.toggles}>{TOGGLES.map(([key,label])=><label key={key}><input type="checkbox" checked={a[key]===true} onChange={e=>setA(p=>({...p,[key]:e.target.checked}))}/>{label}</label>)}</div>
 <div className={s.actions}><button type="button" onClick={()=>{setA(saved);setMessage('Unsaved appearance changes discarded.');}}>Discard changes</button><button type="button" className={s.primary} onClick={()=>void save()}><Save size={17}/>{busy==='save'?'Saving…':'Save settings'}</button></div>
 </fieldset></section><aside className={s.card}><div className={s.previewTitle}><h2>Live preview</h2><ReceiptViewer receipt={sample} context={context}/></div><p className={s.muted}>Sample values only. This does not create or change an order.</p><div className={s.preview}><PosReceipt receipt={sample} context={context}/></div></aside></div>
 </div>;
}
