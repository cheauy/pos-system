'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Plus, Printer, Share2, Store } from 'lucide-react';
import { toast } from 'sonner';
import OrderPrintPreview from '@/components/order-print-preview';
import type { SaleReceipt } from './pos-workspace-types';
import { PAYMENT_METHODS, shippingLabel } from './pos-workspace-flow';
import { ProductImage } from './pos-workspace-components';
import s from './pos-sale-completed.module.css';

export type SaleMeta = { method?: string; images: Record<string, string | null> };
export const lineImageKey = (name: string, variant: string | null) => `${name}|${variant ?? ''}`;

function saleDate(value: string, timeZone?: string) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timeZone || 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return `${parts.year}/${parts.month}/${parts.day}, ${parts.hour}:${parts.minute}:${parts.second}`;
  } catch { return value; }
}

export function SaleCompleted({ receipt, meta, storeAddress, formatMoney, onNextSale }: {
  receipt: SaleReceipt; meta: SaleMeta | null; storeAddress?: string;
  formatMoney: (value: number) => string; onNextSale: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [preview, setPreview] = useState(false);
  const payment = receipt.tenders?.length > 1 ? 'Split payment' : PAYMENT_METHODS.find(([id]) => id === meta?.method)?.[1] ?? (meta?.method ? meta.method.replaceAll('_', ' ') : '—');
  const itemCount = receipt.lines.reduce((sum, line) => sum + line.quantity, 0);

  async function share() {
    const lines = receipt.lines.map(line => `${line.quantity} × ${line.name}${line.variant ? ` (${line.variant})` : ''} — ${formatMoney(line.subtotal)}`);
    const text = [`${receipt.businessName} — Receipt ${receipt.orderNumber}`, saleDate(receipt.createdAt, receipt.timezone), ...lines, `Total: ${formatMoney(receipt.total)}`, 'Thank you for your purchase!'].join('\n');
    setSharing(true);
    try {
      if (navigator.share) await navigator.share({ title: `Receipt ${receipt.orderNumber}`, text });
      else { await navigator.clipboard.writeText(text); toast.success('Receipt copied. Paste it into a chat or message.'); }
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') toast.error('Sharing is unavailable on this device. Use Print Receipt instead.');
    } finally { setSharing(false); }
  }

  return <div className={s.wrap}>
    <div className={s.hero} aria-hidden="true">
      <span className={s.ring} />
      <span className={s.circle}><svg viewBox="0 0 52 52"><path className={s.check} d="M15 27.5 L23 35 L38 18" /></svg></span>
      {[0, 1, 2, 3, 4, 5, 6].map(index => <i key={index} className={s.spark} data-index={index} />)}
    </div>
    <h2 className={s.title}>Sale completed</h2>
    <p className={s.subtitle}>{receipt.remaining > 0 ? `Sale saved · ${formatMoney(receipt.remaining)} balance due.` : 'Payment recorded successfully.'}</p>

    <div className={s.thanks}><span><Check size={18} /></span><div><strong>Thank you for your purchase!</strong><small>Receipt is available to print or share if needed.</small></div></div>

    <section className={s.card}>
      <div className={s.store}><span><Store size={24} /></span><div><strong data-i18n-ignore="true">{receipt.businessName}</strong>{storeAddress && <small>{storeAddress}</small>}</div></div>
      <dl className={s.details}>
        <div><dt>Order No.</dt><dd data-i18n-ignore="true">{receipt.orderNumber}</dd></div>
        <div><dt>Date</dt><dd>{saleDate(receipt.createdAt, receipt.timezone)}</dd></div>
        <div><dt>Customer</dt><dd data-i18n-ignore={Boolean(receipt.customerName)}>{receipt.customerName || 'Walk-in customer'}</dd></div>
        <div><dt>Order type</dt><dd>{shippingLabel(receipt.shipping?.method ?? 'in_store')}</dd></div>
        <div><dt>Payment</dt><dd>{payment}</dd></div>
      </dl>
    </section>

    <section className={s.card}>
      <h3 className={s.itemsTitle}>Items ({itemCount})</h3>
      <div className={s.items}>{receipt.lines.map((line, index) => <div key={`${line.name}-${index}`} className={s.item}>
        <ProductImage className={s.itemImage} src={meta?.images[lineImageKey(line.name, line.variant)] ?? null} alt={line.name}  data-i18n-ignore-attributes="alt"/>
        <div className={s.itemText}><strong data-i18n-ignore="true">{line.name}</strong>{(line.variant || line.options.length > 0) && <small>{[line.variant, ...line.options.map(option => option.name)].filter(Boolean).join(' · ')}</small>}</div>
        <div className={s.itemPrice}><small>Qty {line.quantity}</small><strong>{formatMoney(line.subtotal)}</strong></div>
      </div>)}</div>
      {receipt.discount > 0 && <div className={s.row}><span>Discount</span><span>−{formatMoney(receipt.discount)}</span></div>}
      {receipt.deliveryFee > 0 && <div className={s.row}><span>Shipping fee</span><span>{formatMoney(receipt.deliveryFee)}</span></div>}
      {receipt.change > 0 && <div className={s.row}><span>Change given</span><span>{formatMoney(receipt.change)}</span></div>}
      <div className={s.total}><span>Total</span><strong>{formatMoney(receipt.total)}</strong></div>
    </section>

    <button type="button" className={s.primary} onClick={onNextSale} autoFocus><Plus size={20} />Next Sale</button>
    <div className={s.pair}>
      <button type="button" className={s.secondary} onClick={() => setPreview(true)}><Printer size={18} />Print Receipt</button>
      <button type="button" className={s.secondary} disabled={sharing} onClick={() => void share()}><Share2 size={18} />Share Receipt</button>
    </div>
    <Link className={s.ghost} href={`/dashboard/orders/${receipt.orderId}`}>View Order</Link>
    {preview && <OrderPrintPreview orderId={receipt.orderId} kind="receipt" onClose={() => setPreview(false)} />}
  </div>;
}
