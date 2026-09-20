 'use client';
import { useState } from 'react';
import { ImagePlus, Save } from 'lucide-react';
import { PosReceipt } from '@/components/receipts/pos-receipt';
import { ReceiptViewer } from '@/components/receipts/receipt-viewer';
import { receiptSample, receiptSettingsIssue, type ReceiptAppearance, type ReceiptContext } from '@/lib/receipts/receipt-model';
import { saveReceiptAppearance, uploadReceiptLogo, uploadReceiptQr } from './actions';
import s from './receipt-settings.module.css';
const TOGGLES: Array<[keyof ReceiptAppearance,string]>=[['showLogo','Logo'],['showCustomer','Customer'],['showDiscount','Discount'],['showPayment','Payment details'],['showFulfillment','Order type and delivery'],['showNotes','Order notes'],['showOrderNumber','Order number'],['showLoyalty','Loyalty points'],['showCashier','Cashier, when recorded']];
export function ReceiptSettingsEditor({businessId,initial}:{businessId:string;initial:ReceiptContext}) {
 const [a,setA]=useState(initial.appearance);const [busy,setBusy]=useState('');const [message,setMessage]=useState('');const [saved,setSaved]=useState(initial.appearance);
 const sample=receiptSample(initial.store.name);const context={...initial,appearance:a};
 async function save(){const issue=receiptSettingsIssue(a);if(issue){setMessage(issue);return;}setBusy('save');setMessage('');try{const r=await saveReceiptAppearance(businessId,a);if(r.success){setSaved(a);setMessage('Receipt settings saved. Actual receipt views will use this design.');}else setMessage(r.message);}catch{setMessage('Save could not be confirmed. Reopen settings to check before trying again.');}finally{setBusy('');}}
 async function upload(file:File | undefined, kind:'logo'|'qr'='logo'){if(!file)return;setBusy('upload');setMessage('');try{const form=new FormData();form.set('logo',file);const r=await (kind==='logo'?uploadReceiptLogo:uploadReceiptQr)(businessId,form);if(r.success){setA(p=>kind==='logo'?{...p,logoUrl:r.url,showLogo:true}:{...p,qrUrl:r.url,showQr:true});setMessage('Image uploaded. Save receipt settings to apply it.');}else setMessage(r.message);}catch{setMessage('Image upload failed. Please retry.');}finally{setBusy('');}}
 return <div className={s.page}>
 <header><h2>Receipt Settings</h2><p>Standard Receipt · customize your images and text with a live preview.</p></header>
 {message && <p role="status" className={s.notice}>{message}</p>}
 <div className={s.layout}><section className={s.card}><fieldset disabled={!!busy} className={s.fields}>
 <h2>Standard Receipt</h2><p className={s.muted}>One receipt layout with automatic length.</p>
 <label>Paper size<select value={a.paperSize} onChange={e=>setA(p=>({...p,paperSize:e.target.value as ReceiptAppearance['paperSize']}))}><option value="58mm">58 mm × Auto</option><option value="76mm">76 mm × Auto</option><option value="80mm">80 mm × Auto — Standard Receipt — Default</option></select></label>
 <h2>Receipt logo</h2><p className={s.muted}>This logo is for receipts only. Your storefront logo is not changed. Uploaded logos are public branding assets.</p>
 <p className={s.muted}>Recommended logo: 600 × 300 px. Prints up to 40 × 20 mm. PNG, JPEG or WebP, max 750 KB.</p>
 <label className={s.upload}><ImagePlus size={18}/> Upload PNG / JPEG / WebP · max 750 KB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label>

 {a.logoUrl && <ImageSize key={a.logoUrl} src={a.logoUrl} label="Logo"/>}
 <button type="button" onClick={()=>setA(p=>({...p,logoUrl:null,showLogo:false}))}>Remove receipt logo</button>
 <h2>Receipt QR code</h2><p className={s.muted}>Upload your QR image with its white margins. Recommended: 600 × 600 px; printed size 26 × 26 mm. PNG, JPEG or WebP, max 750 KB.</p>
 <label className={s.upload}><ImagePlus size={18}/> Upload QR code<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0],'qr')}/></label>
 {a.qrUrl && <ImageSize key={a.qrUrl} src={a.qrUrl} label="QR code"/>}
 <div className={s.toggles}><label><input type="checkbox" checked={a.showQr} onChange={e=>setA(p=>({...p,showQr:e.target.checked}))}/>Show QR code</label></div>
 <button type="button" onClick={()=>setA(p=>({...p,qrUrl:null,showQr:false}))}>Remove QR code</button>
 <p className={s.muted}>Shop address and telephone are taken from Online Store → Contact and appear below your shop name.</p><h2>Text</h2>{([['header','Header text'],['footer','Footer text'],['returnPolicy','Return policy']] as const).map(([key,label])=><label key={key}>{label}<textarea rows={2} maxLength={500} value={a[key]} onChange={e=>setA(p=>({...p,[key]:e.target.value}))}/></label>)}
 <h2>Visible sections</h2><div className={s.toggles}>{TOGGLES.map(([key,label])=><label key={key}><input type="checkbox" checked={a[key]===true} onChange={e=>setA(p=>({...p,[key]:e.target.checked}))}/>{label}</label>)}</div>
 <div className={s.actions}><button type="button" onClick={()=>{setA(saved);setMessage('Unsaved appearance changes discarded.');}}>Discard changes</button><button type="button" className={s.primary} onClick={()=>void save()}><Save size={17}/>{busy==='save'?'Saving…':'Save settings'}</button></div>
 </fieldset></section><aside className={s.card}><div className={s.previewTitle}><h2>Live preview</h2><ReceiptViewer receipt={sample} context={context}/></div><div className={s.preview}><PosReceipt receipt={sample} context={context}/></div></aside></div>
 </div>;
}

function ImageSize({src,label}:{src:string;label:string}) {
 const [size,setSize]=useState('');
 return <div style={{display:'flex',alignItems:'center',gap:12}}><img src={src} alt={label} style={{width:64,height:64,objectFit:'contain',background:'white'}} onLoad={event=>setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight} px`)} /><span>{label}{size?` · ${size}`:''}</span></div>;
}
