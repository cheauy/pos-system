 'use client';
import { useState, type CSSProperties } from 'react';
import { code39Bars } from '@/lib/barcode/code39';
import type { SaleReceipt } from '@/app/(dashboard)/dashboard/pos/pos-workspace-types';
import { DEFAULT_RECEIPT, printTextScale, type ReceiptContext } from '@/lib/receipts/receipt-model';
import { money } from '@/app/(dashboard)/dashboard/pos/pos-workspace-helpers';
import s from './pos-receipt.module.css';
import { useLanguage } from '@/components/providers/language-provider';
export function PosReceipt({receipt:r,context}:{receipt:SaleReceipt;context?:ReceiptContext}) {
 const {t}=useLanguage();
 const a=context?.appearance || DEFAULT_RECEIPT;
 const cash=(v:number)=>money(Number(v),r.currency);
 let date='';try{date=new Date(r.createdAt).toLocaleString('en-GB',{timeZone:r.timezone || 'Asia/Phnom_Penh'});}catch{date=r.createdAt;}
 const shipping=r.shipping;
 const printWidth=`${parseInt(a.paperSize,10)-6}mm`;
 // Numeric order code when known (scans to the order); older receipts fall back to the order number.
 const barcodeText=r.orderCode && /^[1-9][0-9]{11}$/.test(r.orderCode)?r.orderCode:r.orderNumber;
 const barcode=code39Bars(barcodeText.toUpperCase().replace(/[^A-Z0-9 .\-\$\/%+]/g,'-').slice(0,40));
 return <article className={`${s.receipt} ${s.classic} receipt`} data-paper={a.paperSize} data-density={a.density} style={{"--receipt-font-scale":printTextScale(a.fontSize),"--receipt-alignment":a.alignment} as CSSProperties}>
  <style media="print">{`@page{size:auto;margin:3mm}html,body{width:${printWidth}!important;min-width:${printWidth}!important}.receipt{width:${printWidth}!important;max-width:${printWidth}!important}`}</style>
  <header>
   {a.showLogo && a.logoUrl && <ReceiptLogo key={a.logoUrl} src={a.logoUrl}/>}
   {a.showBusinessName!==false && <h2 data-i18n-ignore="true">{r.businessName || context?.store.name}</h2>}
   {a.showAddress && context?.store.address && <p className={`${s.pre} ${s.contact}`} data-i18n-ignore="true">{context.store.address}</p>}
   {a.showPhone && context?.store.phone && <p className={s.contact}>{t('Tel:')} <span data-i18n-ignore="true">{context.store.phone}</span></p>}
   {a.showWifi && a.wifiPassword && <p className={s.contact}>{t('Wi-Fi password:')} <span data-i18n-ignore="true">{a.wifiPassword}</span></p>}
   {a.header && <p className={s.pre} data-i18n-ignore="true">{a.header}</p>}
   <Separator/>
   <dl className={s.details}>
    {a.showOrderNumber && <Row label="Order No" value={r.orderNumber}/>}
    <Row label="Date" value={date}/>
    {a.showCashier && r.cashierName && <Row label="Cashier" value={r.cashierName}/>}
    {a.showCustomer && <Row label="Customer" value={r.customerName || t('Walk-in')}/>}
   </dl>
   {a.showFulfillment && shipping && <><p>{t('Order type:')} {t(shipping.method==='delivery'?'Delivery':shipping.method==='pickup'?'Pickup':'In-store')}</p>
    {shipping.method!=='in_store' && <>{shipping.recipientName && <p>{t('Recipient:')} <span data-i18n-ignore="true">{shipping.recipientName}</span></p>}{shipping.phone && <p data-i18n-ignore="true">{shipping.phone}</p>}</>}
    {shipping.method==='delivery' && <><p className={s.pre} data-i18n-ignore="true">{shipping.address}</p>{shipping.carrier && <p>{t('Shipping type:')} <span data-i18n-ignore="true">{shipping.carrier==='jt'?'J&T':shipping.carrier==='vet'?'VET':shipping.carrier==='grab'?'Grab':shipping.carrierOther || t('Other')}</span></p>}</>}
   </>}
  </header>
  <Separator/>
  <table><thead><tr><th>#</th><th>{t('Item')}</th><th>{t('Qty')}</th><th>{t('Price')}</th><th>{t('Total')}</th></tr><tr aria-hidden="true"><td colSpan={5} className={s.separatorCell}><Separator/></td></tr></thead><tbody>{r.lines.map((l,i)=><tr key={i}><td>{i+1}</td><td><span data-i18n-ignore="true">{l.name}</span>{l.variant && <small data-i18n-ignore="true">{l.variant}</small>}{l.options?.map((o,j)=><small key={j} data-i18n-ignore="true">{o.groupName?`${o.groupName}: `:''}{o.name}</small>)}</td><td>{l.quantity}</td><td>{cash(l.unitPrice)}</td><td>{cash(l.subtotal)}</td></tr>)}</tbody></table>
  <Separator/>
  <dl><Row label="Subtotal" value={cash(r.subtotal)}/>{a.showDiscount && <Row label={`Discount${r.discountType==='percent'?` (${r.discountValue}%)`:''}`} value={`−${cash(r.discount)}`}/>}
   {r.taxAmount>0 && <Row label={`Tax (${r.taxRate}%)`} value={cash(r.taxAmount)}/>}<Row label="Shipping fee" value={cash(r.deliveryFee)}/><Row label="Total" value={cash(r.total)} total/>
   {a.showPayment && <>{(r.tenders || []).map((tender,i)=><Row key={i} label={`${t('Payment')} · ${t(tender.method.replaceAll('_',' ').toUpperCase())}`} value={cash(tender.amount)}/>)}<Row label="Received" value={cash(r.amountPaid)}/>{r.change>0 && <Row label="Change given" value={cash(r.change)}/>}<Row label="Balance due" value={cash(r.remaining)}/></>}
  </dl>
  {a.showLoyalty && (r.pointsEarned>0 || r.pointsRedeemed>0) && <p>{t('Points earned:')} {r.pointsEarned} · {t('Used:')} {r.pointsRedeemed}</p>}
  {a.showNotes && r.note && <p className={s.pre}>{t('Note:')} <span data-i18n-ignore="true">{r.note}</span></p>}
  <Separator/>
  <footer>{a.showQr && a.qrUrl && <div className={s.qr}><ReceiptLogo key={a.qrUrl} src={a.qrUrl} qr/></div>}{a.footer && <p className={s.pre} data-i18n-ignore="true">{a.footer}</p>}{a.showOrderNumber && <div className={s.barcode}><svg shapeRendering="crispEdges" aria-label={t(`Order barcode ${barcode.text}`)} viewBox={`0 0 ${barcode.width} 44`} preserveAspectRatio="none">{barcode.bars.map((bar,index)=><rect key={index} x={bar.x} width={bar.width} y="0" height="44" fill="black"/>)}</svg><p data-i18n-ignore="true">{barcodeText}</p></div>}{a.returnPolicy && <p className={s.pre} data-i18n-ignore="true">{a.returnPolicy}</p>}{r.orderId!=='preview' && <small>{t(r.isOrderRecord?'Current order record · TENH POS':'Original sale record · TENH POS')}</small>}</footer>
 </article>;
}
function ReceiptLogo({src,qr=false}:{src:string;qr?:boolean}){const{t}=useLanguage();const[failed,setFailed]=useState(false);return failed?<small data-print-image-error="true">{t('Image unavailable')}</small>:<img loading="eager" decoding="sync" className={qr?s.qrImage:s.logo} src={src} alt={t(qr?"Receipt QR code":"Receipt logo")} onError={()=>setFailed(true)}/>;}
function Separator(){return <div aria-hidden="true" className={s.separator}>{'*'.repeat(80)}</div>;}
function Row({label,value,total=false}:{label:string;value:string;total?:boolean}){const{t}=useLanguage();return <div className={total?s.total:undefined}><dt>{t(label)}</dt><dd data-i18n-ignore="true">{value}</dd></div>;}
