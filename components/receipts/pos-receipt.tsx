 'use client';
import { useState } from 'react';
import type { SaleReceipt } from '@/app/(dashboard)/dashboard/pos/pos-workspace-types';
import { DEFAULT_RECEIPT, type ReceiptContext } from '@/lib/receipts/receipt-model';
import { money } from '@/app/(dashboard)/dashboard/pos/pos-workspace-helpers';
import s from './pos-receipt.module.css';
export function PosReceipt({receipt:r,context}:{receipt:SaleReceipt;context?:ReceiptContext}) {
 const a=context?.appearance || DEFAULT_RECEIPT;
 const cash=(v:number)=>money(Number(v),r.currency);
 let date='';try{date=new Date(r.createdAt).toLocaleString('en-GB',{timeZone:r.timezone || 'Asia/Phnom_Penh'});}catch{date=r.createdAt;}
 const shipping=r.shipping;
 const printWidth=a.paperSize==='58mm'?'52mm':'74mm';
 return <article className={`${s.receipt} ${s[a.template]} receipt`} data-paper={a.paperSize}>
  <style media="print">{`@page{size:auto;margin:3mm}html,body{width:${printWidth}!important;min-width:${printWidth}!important}.receipt{width:${printWidth}!important;max-width:${printWidth}!important}`}</style>
  <header>
   {a.showLogo && a.logoUrl && <ReceiptLogo key={a.logoUrl} src={a.logoUrl}/>}
   <h2>{r.businessName || context?.store.name}</h2>
   {a.header && <p className={s.pre}>{a.header}</p>}
   <p>{r.branchName}</p>
   {a.showPhone && context?.store.phone && <p>{context.store.phone}</p>}
   {a.showAddress && context?.store.address && <p className={s.pre}>{context.store.address}</p>}
   <h3>Sale receipt{a.showOrderNumber ? ` · ${r.orderNumber}`:''}</h3><p>{date}</p>
   {a.showCashier && r.cashierName && <p>Cashier: {r.cashierName}</p>}
   {a.showCustomer && <p>{r.customerName || 'Walk-in customer'}</p>}
   {a.showFulfillment && shipping && <><p>Order type: {shipping.method==='delivery'?'Delivery':shipping.method==='pickup'?'Pickup':'In-store'}</p>
    {shipping.method!=='in_store' && <>{shipping.recipientName && <p>Recipient: {shipping.recipientName}</p>}{shipping.phone && <p>{shipping.phone}</p>}</>}
    {shipping.method==='delivery' && <><p className={s.pre}>{shipping.address}</p>{shipping.carrier && <p>Shipping type: {shipping.carrier==='jt'?'J&T':shipping.carrier==='vet'?'VET':shipping.carrier==='grab'?'Grab':shipping.carrierOther || 'Other'}</p>}</>}
   </>}
  </header>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>{r.lines.map((l,i)=><tr key={i}><td>{l.name}{l.variant && <small>{l.variant}</small>}{l.options?.map((o,j)=><small key={j}>{o.groupName?`${o.groupName}: `:''}{o.name}</small>)}<small>{cash(l.unitPrice)} each</small></td><td>{l.quantity}</td><td>{cash(l.subtotal)}</td></tr>)}</tbody></table>
  <dl><Row label="Subtotal" value={cash(r.subtotal)}/>{a.showDiscount && <Row label={`Discount${r.discountType==='percent'?` (${r.discountValue}%)`:''}`} value={`−${cash(r.discount)}`}/>}
   <Row label={`Tax (${r.taxRate}%)`} value={cash(r.taxAmount)}/><Row label="Shipping fee" value={cash(r.deliveryFee)}/><Row label="Total" value={cash(r.total)} total/>
   {a.showPayment && <>{(r.tenders || []).map((t,i)=><Row key={i} label={t.method.replaceAll('_',' ')} value={cash(t.amount)}/>)}<Row label="Received" value={cash(r.amountPaid)}/>{r.change>0 && <Row label="Change given" value={cash(r.change)}/>}<Row label="Balance due" value={cash(r.remaining)}/></>}
  </dl>
  {a.showLoyalty && (r.pointsEarned>0 || r.pointsRedeemed>0) && <p>Points earned: {r.pointsEarned} · Used: {r.pointsRedeemed}</p>}
  {a.showNotes && r.note && <p className={s.pre}>Note: {r.note}</p>}
  <footer>{a.footer && <p className={s.pre}>{a.footer}</p>}{a.returnPolicy && <p className={s.pre}>{a.returnPolicy}</p>}<small>{r.orderId==='preview'?'Sample preview — not a sale':r.isOrderRecord?'Current order record · TENH POS':'Original sale record · TENH POS'}</small></footer>
 </article>;
}
function ReceiptLogo({src}:{src:string}){const[failed,setFailed]=useState(false);return failed?<small>Logo unavailable</small>:<img className={s.logo} src={src} alt="Receipt logo" onError={()=>setFailed(true)}/>;}
function Row({label,value,total=false}:{label:string;value:string;total?:boolean}){return <div className={total?s.total:undefined}><dt>{label}</dt><dd>{value}</dd></div>;}
