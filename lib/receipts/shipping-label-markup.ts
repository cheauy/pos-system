import { code39Bars } from '@/lib/barcode/code39';
import { orderContact } from '@/lib/orders/order-contact';
import { orderBalanceDue, orderPaymentMethod, orderPaymentState, orderPaymentNeedsReview, balanceIsCod, type PaymentRecord } from '@/lib/orders/order-payment';
import { isOrderCode, orderQrSvg } from '@/lib/orders/order-qr';
import { printTextScale, receiptLogoUrl } from '@/lib/receipts/receipt-model';
import { shippingLabelSize, shippingTemplate, shippingCustomTemplates } from './shipping-templates';
import { defaultShippingLayout, resizeShippingLayout, validateShippingLayout, assertShippingQrSize, shippingQrMinimumMm, shippingQrModules } from './shipping-layout';
import { shippingElementMarkup, shippingQr, shippingOrderQrMinimumMm } from './shipping-custom';
import { translateUiText, type AppLanguage } from '@/lib/i18n/translations';
import type { ShippingDetails } from '@/app/(dashboard)/dashboard/pos/pos-workspace-types';

export type ShippingOrder = PaymentRecord & {
  id: string; order_number: string; order_code?: string | null; created_at: string; total: number;
  payment_method: string | null; payment_status?: string | null; remaining_balance?: number;
  pos_checkout?: { method?: string; receipt?: { shipping?: ShippingDetails }; shipping?: ShippingDetails } | null;
  guest_name?: string | null; guest_phone?: string | null; guest_address?: string | null; tracking_number?: string | null;
  customers?: { name?: string | null; phone?: string | null; address?: string | null } | Array<{ name?: string | null; phone?: string | null; address?: string | null }> | null;
  order_items?: Array<{ quantity: number }> | null;
};
export type ShippingStore = { name: string; phone: string; address: string; logoUrl?: string | null; websiteUrl?: string | null };
export function shippingValues(order: ShippingOrder, store: ShippingStore, currency = 'USD', sample = false) {
  const contact = orderContact(order);
  const code = isOrderCode(order.order_code) ? order.order_code : order.order_number;
  let total: string;
  try { total = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(order.total) || 0); }
  catch { total = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(order.total) || 0); }
  const qr = shippingQr(order.order_code, sample);
  const qrMinimumMm = Math.max(shippingOrderQrMinimumMm(),qr ? shippingQrMinimumMm(shippingQrModules(qr)) : 0);
  const shipping = order.pos_checkout?.receipt?.shipping ?? order.pos_checkout?.shipping;
  const carrier = (shipping?.carrier || '').trim();
  const shippingTypes: Record<string, string> = { jt: 'J&T', vet: 'VET', grab: 'Grab' };
  const shippingType = carrier.toLowerCase() === 'other' ? shipping?.carrierOther?.trim() || 'Other'
    : Object.hasOwn(shippingTypes,carrier.toLowerCase()) ? shippingTypes[carrier.toLowerCase()] : carrier;
  return { storeName: store.name, storePhone: store.phone, storeAddress: store.address,
    customerName: contact.name || 'Customer', customerPhone: contact.phone,
    customerAddress: contact.address, orderNumber: code, total,
    payment: shippingPaymentText(order,currency,true), itemCount: String((order.order_items || []).reduce((sum,item)=>sum+(Number(item.quantity)||0),0)),
    tracking:order.tracking_number||'', shippingType, date:shippingOrderDate(order.created_at), logo:receiptLogoUrl(store.logoUrl)||'',
    qr, qrMinimumMm:String(qrMinimumMm) };
}
export const SHIPPING_LABEL_COPY = {
  en: {
    date: 'Date', recipient: 'Recipient', phone: 'Phone', address: 'Address',
    senderPhone: 'Sender phone', items: 'Items', payment: 'Payment', amount: 'Amount', balance: 'Balance due',
    scan: 'Scan for details', thanks: 'Thank you for your order!', care: 'Handle with care', missingAddress: 'Delivery address missing',
  },
  km: {
    date: 'កាលបរិច្ឆេទ', recipient: 'ឈ្មោះអ្នកទទួល', phone: 'លេខទូរស័ព្ទ', address: 'អាសយដ្ឋាន',
    senderPhone: 'លេខទូរស័ព្ទអ្នកផ្ញើ', items: 'ចំនួន', payment: 'វិធីទូទាត់', amount: 'ចំនួនទឹកប្រាក់', balance: 'ប្រាក់ត្រូវបង់',
    scan: 'ស្កេនដើម្បីមើលព័ត៌មានលម្អិត', thanks: 'សូមអរគុណសម្រាប់ការបញ្ជាទិញ', care: 'សូមដឹកជញ្ជូនដោយប្រុងប្រយ័ត្ន', missingAddress: 'ខ្វះអាសយដ្ឋានដឹកជញ្ជូន',
  },
} as const;
export function escapeShippingHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
/** Use the same explicit zone on the server and in the browser (no hydration/date drift). */
export function shippingOrderDate(value: string, timeZone = 'Asia/Phnom_Penh') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true, timeZone }).format(date).replace(',', '');
  } catch { return shippingOrderDate(value, 'Asia/Phnom_Penh'); }
}
const truck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M1 5h13v12H5M14 9h4l4 4v4h-3M2 9h5M0 13h5"/><circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>';
const bag = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 9V5a4 4 0 0 1 8 0v4"/></svg>';
const heart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';

/** Barcodes are generated, not taken from the reference picture. Include quiet zones. */
function orderBarcode(value: string, language: AppLanguage = 'en') {
  const code = code39Bars(value);
  // Do not print a different identifier by silently truncating/normalizing custom order numbers.
  if (!value || code.text !== value.toUpperCase() || value.length > 40) return '';
  const quiet = 20;
  return `<svg data-linear-code="${escapeShippingHtml(code.text)}" role="img" aria-label="${translateUiText('Order barcode', language)} ${escapeShippingHtml(code.text)}" viewBox="0 0 ${code.width + quiet * 2} 32" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="100%" height="32" fill="white"/>${code.bars.map(bar => `<rect x="${bar.x + quiet}" y="0" width="${bar.width}" height="32" fill="black"/>`).join('')}</svg>`;
}
function paymentName(value: string | null, language: AppLanguage = 'en') {
  const key = (value || '').trim().toLowerCase();
  if (key === 'cod') return 'COD';
  const labels: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', deposit: 'Cash deposit', khqr: 'KHQR', card: 'Card', aba: 'ABA', wing: 'Wing', split: 'Split payment', other: 'Other', credit: 'Customer credit' };
  return labels[key] ? translateUiText(labels[key], language) : (value || '—').replaceAll('_', ' ');
}

export function shippingPaymentText(order: PaymentRecord, currency='USD', includeBalance=false, language: AppLanguage = 'en'): string {
  const t = (text: string) => translateUiText(text, language);
  if(order.status==='cancelled')return t('Cancelled — do not collect');
  const state=orderPaymentState(order),method=paymentName(orderPaymentMethod(order),language);
  if(state==='refunded')return `${method} (${t('Refunded')})`;
  if(state==='pending_verification')return `${method} (${t('Pending verification')})`;
  const review=orderPaymentNeedsReview(order);
  const description=review?`${method} (${t('Needs review')})`:method;
  if(state==='paid'&&!review)return `${method} (${t('Paid')})`;
  if(!includeBalance)return description;
  const due=orderBalanceDue(order);
  if(due===null)return `${description}; ${t('Balance unavailable')}`;
  let amount:string;try{amount=new Intl.NumberFormat('en-US',{style:'currency',currency}).format(due);}catch{amount=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(due);}
  const balance=`${t(review?'Recorded balance':balanceIsCod(order)?'COD due':'Balance due')} ${amount}`;
  // An unpaid COD order prints just "COD" (the total shows what to collect). If part was
  // already paid, keep the remaining amount so the courier does not collect the full total.
  if(orderPaymentMethod(order)==='cod'&&!review)return Math.abs(due-(Number(order.total)||0))<.005?method:balance;
  return `${description}; ${balance}`;
}

export function shippingLabelMarkup({ order, store, settings, size, currency = 'USD' }: {
  order: ShippingOrder; store: ShippingStore; settings: Record<string, unknown>; size?: string; currency?: string;
}) {
  const paper = shippingLabelSize(size ?? settings.shipping_label_size);
  const template = shippingTemplate(settings.shipping_template,settings.shipping_custom_templates);
  if (template.layout === 'custom') {
    const sample = settings.shipping_sample_preview === true && order.id === '00000000-0000-0000-0000-000000000000';
    const values = shippingValues(order, store, currency, sample);
    const named=shippingCustomTemplates(settings.shipping_custom_templates).find(entry=>`custom:${entry.id}`===template.id);
    const saved = named?.layout ?? (typeof settings.shipping_custom_layout === 'string' ? validateShippingLayout(JSON.parse(settings.shipping_custom_layout),shippingOrderQrMinimumMm()) : defaultShippingLayout(paper.id));
    const layout = resizeShippingLayout(saved, paper.id,Number(values.qrMinimumMm));
    for (const element of layout.elements) assertShippingQrSize(element,paper.id,Number(values.qrMinimumMm));
    return {paper,template,className:'shipping-label ship-custom',style:`--ship-width:${paper.width}mm;--ship-height:${paper.height}mm`,inner:layout.elements.map(element=>shippingElementMarkup(element,values)).join('')};
  }
  const km = template.language === 'km', copy = SHIPPING_LABEL_COPY[template.language];
  const compact = paper.id === '80x50';
  const contact = orderContact(order);
  const name = contact.name || (km ? 'អតិថិជន' : 'Customer');
  const phone = contact.phone;
  const address = contact.address;
  const visible = (key: string) => settings[`shipping_show_${key}`] !== false;
  const sender = (key: string) => (settings[`shipping_show_store_${key}`] ?? settings.shipping_show_sender) !== false;
  const amount = (value: number) => {
    const n = Number.isFinite(Number(value)) ? Number(value) : 0;
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n); }
    catch { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); }
  };
  const qty = (order.order_items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const due = orderBalanceDue(order), balanceAmount = due == null ? translateUiText('Unavailable', template.language) : amount(due);
  // A shorter Khmer total label leaves room for the explicit unknown balance at 80 x 50.
  const compactUnknownBalance = compact && km && due == null;
  const row = (label: string, value: string, className = '') => `<div class="ship-row ${className}" data-fit-box><dt>${escapeShippingHtml(label)}</dt><span aria-hidden="true">:</span><dd>${escapeShippingHtml(value)}</dd></div>`;
  // Keep total and balance distinct without adding a ninth row to the 80 x 50 composition.
  const amounts = compact
    ? `<div class="ship-row ship-amount${compactUnknownBalance ? ' ship-amount-unknown' : ''}" data-fit-box><dt>${escapeShippingHtml(compactUnknownBalance ? 'សរុប' : copy.amount)}</dt><span aria-hidden="true">:</span><dd>${escapeShippingHtml(amount(order.total))}<span class="ship-balance-note">${escapeShippingHtml(copy.balance)}: ${escapeShippingHtml(balanceAmount)}</span></dd></div>`
    : row(copy.amount, amount(order.total), 'ship-amount') + row(copy.balance, balanceAmount, 'ship-balance');
  const rows = [
    visible('date') ? row(copy.date, shippingOrderDate(order.created_at, typeof settings.shipping_timezone === 'string' ? settings.shipping_timezone : undefined), 'ship-date') : '',
    row(copy.recipient, name, 'ship-recipient'),
    visible('phone') && phone ? row(copy.phone, phone, 'ship-phone') : '',
    row(copy.address, address || copy.missingAddress, 'ship-address'),
    sender('phone') && store.phone ? row(copy.senderPhone, store.phone, 'ship-sender-phone') : '',
    visible('item_count') ? row(copy.items, String(qty) + (km ? ' មុខទំនិញ' : qty === 1 ? ' item' : ' items')) : '',
    visible('cod') ? row(copy.payment, shippingPaymentText(order,currency,false,template.language)) : '',
    visible('cod') ? amounts : '',
  ].join('');
  const logo = visible('logo') && sender('name') ? receiptLogoUrl(store.logoUrl) : null;
  const brand = sender('name') ? (logo
    ? `<img class="ship-logo" src="${escapeShippingHtml(logo)}" alt="${escapeShippingHtml(store.name)}" loading="eager"/>`
    : `<span class="ship-truck">${truck}</span><strong class="ship-store">${escapeShippingHtml(store.name)}</strong>`) : '';
  // Scannable codes use the numeric order code; older rows without one keep the order number.
  const scanId = isOrderCode(order.order_code) ? order.order_code : order.order_number;
  const barcode = visible('order_number') && visible('linear_barcode') ? orderBarcode(scanId,template.language) : '';
  const header = `<div class="ship-header" data-fit-box>
    <div class="ship-brand-title"><div class="ship-brand">${brand}</div></div>
    ${visible('order_number') ? `<div class="ship-order"><strong>${escapeShippingHtml(scanId)}</strong>${barcode}</div>` : ''}
  </div>`;
  const senderAddress = sender('address') && store.address ? `<div class="ship-store-address" data-fit-box>${escapeShippingHtml(store.address)}</div>` : '';
  const qr = visible('barcode') && isOrderCode(order.order_code) ? `<div class="ship-codes"><div class="ship-qr" role="img" aria-label="${translateUiText('Order QR code', template.language)}">${orderQrSvg(order.order_code)}</div><div class="ship-scan" data-fit-box>${copy.scan}</div></div>` : '';
  let website = '';
  try {
    const url = new URL(store.websiteUrl || '');
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) website = url.hostname;
  } catch { /* An absent/invalid website is not printed. */ }
  const footerSite = website ? `<span class="ship-website">${escapeShippingHtml(website)}</span>` : '';
  const footer = visible('footer') ? `<div class="ship-footer${website ? ' ship-has-website' : ''}" data-fit-box><span class="ship-bag">${bag}</span><div>${footerSite}<strong>${copy.thanks}</strong></div><span class="ship-heart">${heart}</span></div>` : '';
  const textScale = printTextScale(settings.font_size);
  const style = `--ship-width:${paper.width}mm;--ship-height:${paper.height}mm;--ship-user-scale:${textScale};--ship-fit-scale:1`;
  const className = `shipping-label ship-template ship-${template.layout}${compact ? ' ship-small' : paper.id === '100x100' ? ' ship-square' : ' ship-tall'}${km ? ' ship-khmer' : ''}${visible('barcode') ? '' : ' ship-no-qr'}${visible('footer') ? '' : ' ship-no-footer'}`;
  return { paper, template, className, style, inner: `${header}${senderAddress}<div class="ship-body"><dl class="ship-details" data-fit-box>${rows}</dl>${qr}</div>${footer}` };
}

/** Scoped CSS: admin theme, text preferences and preview viewport cannot change the paper size. */
export const SHIPPING_LABEL_CSS = `
.ship-custom{position:relative!important;width:var(--ship-width)!important;height:var(--ship-height)!important;min-height:var(--ship-height)!important;max-width:none!important;flex-shrink:0;margin:0!important;padding:0!important;border:0!important;box-sizing:border-box;background:white!important;color:black!important;overflow:hidden;font-family:Arial,sans-serif}
.ship-custom [data-custom-field]{margin:0;padding:0;color:black;box-sizing:border-box}
.ship-custom svg{display:block;max-width:none}
.ship-template,.ship-template *{box-sizing:border-box}
.ship-template{--ship-base:12px;--ship-padding:3mm;--ship-gap:2mm;--ship-qr:32mm;--ship-heading:1.25em;--ship-row-gap:1.25mm;--ship-label:26mm;--ship-fit-scale:1;--ship-user-scale:1;
 width:var(--ship-width)!important;height:var(--ship-height)!important;min-height:var(--ship-height)!important;max-width:none!important;flex-shrink:0;margin:0;
 padding:var(--ship-padding)!important;border:.22mm solid #111!important;border-radius:2mm;background:#fff!important;color:#000!important;
 display:flex;flex-direction:column;gap:var(--ship-gap);overflow:hidden;font-family:Arial,var(--font-hanuman,'Hanuman'),'Khmer Sangam MN','Noto Sans Khmer',sans-serif;
 font-size:calc(var(--ship-base)*var(--ship-user-scale)*var(--ship-fit-scale));line-height:1.45;font-weight:400;text-align:left;isolation:isolate}
.ship-template.ship-khmer{font-family:var(--font-hanuman,'Hanuman'),'Khmer Sangam MN','Noto Sans Khmer',Arial,sans-serif;line-height:1.6}
.ship-template :is(p,dl,dt,dd,strong,span){margin:0;padding:0;color:#000;text-shadow:none}
.ship-template :is(img,svg){display:block;margin:0;max-width:100%;flex-shrink:0}
.ship-template .ship-header{display:grid;grid-template-columns:minmax(0,1fr) 40%;gap:2mm;align-items:center;flex-shrink:0;padding-bottom:var(--ship-gap);border-bottom:.2mm dashed #888;min-height:10mm}
.ship-template .ship-brand-title{display:flex;align-items:center;gap:2mm;min-width:0}
.ship-template .ship-brand{display:flex;align-items:center;gap:1.2mm;min-width:0;flex:1}
.ship-template .ship-store{font-size:1.35em;font-weight:800;line-height:1.3;overflow-wrap:anywhere}
.ship-template .ship-logo{width:100%;height:10mm;object-fit:contain;object-position:left center}
.ship-template .ship-truck{width:6mm;flex-shrink:0}
.ship-template .ship-heading{border-left:.25mm solid #111;padding-left:2mm;flex-shrink:0;font-size:.94em;line-height:1.5}
.ship-template .ship-heading strong,.ship-template .ship-heading span{display:block;white-space:nowrap}
.ship-template .ship-order{min-width:0;text-align:left;overflow-wrap:anywhere;font-family:Arial,sans-serif}
.ship-template .ship-order strong{font-size:1.1em;display:block;line-height:1.3;margin-bottom:.65mm}
.ship-template .ship-order svg{width:100%;height:6mm}
.ship-template .ship-store-address{font-size:.88em;flex-shrink:0;overflow-wrap:anywhere;line-height:1.4}
.ship-template .ship-body{display:grid;grid-template-columns:minmax(0,1fr) calc(var(--ship-qr) + 3mm);gap:2mm;flex:1;min-height:0;align-items:start}
.ship-template .ship-details{min-width:0;max-height:100%;display:flex;flex-direction:column;gap:calc(var(--ship-row-gap)*var(--ship-fit-scale));align-self:start;overflow:visible}
.ship-template .ship-row{display:grid;grid-template-columns:minmax(0,var(--ship-label)) 1.5mm minmax(0,1fr);gap:.65mm;align-items:start;min-width:0;flex-shrink:0}
.ship-template .ship-row dt{overflow-wrap:normal;font-weight:500}
.ship-template .ship-row dd{min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
.ship-template .ship-recipient dd,.ship-template .ship-phone dd{font-weight:700}
.ship-template .ship-amount dd{font-size:1.35em;line-height:1.3;font-weight:800;font-family:Arial,sans-serif}
.ship-template .ship-codes{border-left:.2mm dashed #888;padding-left:2mm;min-width:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:1mm}
.ship-template .ship-qr{width:var(--ship-qr);height:var(--ship-qr);flex-shrink:0;background:#fff}
.ship-template .ship-qr svg{width:100%;height:100%}
.ship-template .ship-scan{text-align:center;font-size:.83em;line-height:1.5;overflow-wrap:anywhere}
.ship-template .ship-scan span,.ship-template .ship-footer div span{display:block;font-family:Arial,sans-serif}
.ship-template .ship-footer{display:flex;align-items:center;gap:2mm;border-top:.2mm dashed #888;padding-top:1.5mm;flex-shrink:0;font-size:.9em;line-height:1.5}
.ship-template .ship-footer div{flex:1;min-width:0;overflow-wrap:anywhere}
.ship-template .ship-bag,.ship-template .ship-heart{width:5mm;flex-shrink:0}
.ship-template .ship-heart{margin-left:auto;width:4mm}
.ship-template.ship-no-qr .ship-body{grid-template-columns:minmax(0,1fr)}
.ship-template.ship-classic{border-radius:0}
.ship-template.ship-classic .ship-header{border-bottom:.4mm solid #111}
.ship-template.ship-classic .ship-brand-title{flex-direction:column;align-items:flex-start;gap:.5mm}
.ship-template.ship-classic .ship-heading{border:0;padding:0;font-size:1em}
.ship-template.ship-classic .ship-heading span{display:inline;margin-left:1mm}
.ship-template.ship-classic .ship-codes{border:.2mm solid #111;padding:1mm;height:auto;align-self:end}
.ship-template.ship-classic .ship-body{grid-template-columns:minmax(0,1fr) calc(var(--ship-qr) + 2.5mm)}
.ship-template.ship-classic.ship-no-qr .ship-body{grid-template-columns:minmax(0,1fr)}
.ship-template.ship-classic .ship-footer{border-top:.3mm solid #111}
.ship-template.ship-small{--ship-base:9px;--ship-padding:1.5mm;--ship-gap:1mm;--ship-qr:21mm;--ship-row-gap:.1mm;--ship-label:16.5mm;border-radius:1.2mm;line-height:1.4}
.ship-template.ship-small.ship-khmer{line-height:1.55}
.ship-template.ship-small .ship-header{min-height:7mm;gap:1.5mm;padding-bottom:.7mm;grid-template-columns:minmax(0,1fr) 38%}
.ship-template.ship-small .ship-brand-title{gap:1mm;align-items:flex-start;flex-direction:column}
.ship-template.ship-small .ship-brand{gap:1mm}
.ship-template.ship-small .ship-truck{width:4mm}
.ship-template.ship-small .ship-store{font-size:1.3em}
.ship-template.ship-small .ship-heading{border:0;padding:0;display:flex;gap:1mm;align-items:baseline;font-size:.88em;line-height:1.35}
.ship-template.ship-small .ship-order strong{font-size:.98em;margin-bottom:.4mm;white-space:normal;word-break:break-all}
.ship-template.ship-small .ship-order svg{height:3.8mm}
.ship-template.ship-small .ship-logo{height:5.5mm;width:auto;max-width:28mm}
.ship-template.ship-small .ship-store-address{font-size:.78em;line-height:1.2}
.ship-template.ship-small .ship-body{grid-template-columns:minmax(0,1fr) calc(var(--ship-qr) + 1.5mm);gap:1mm}
.ship-template.ship-small.ship-no-qr .ship-body{grid-template-columns:minmax(0,1fr)}
.ship-template.ship-small .ship-row{grid-template-columns:minmax(0,var(--ship-label)) 1mm minmax(0,1fr);gap:.4mm}
.ship-template.ship-small.ship-khmer .ship-amount-unknown{grid-template-columns:7mm 1mm minmax(0,1fr)}
.ship-template.ship-small .ship-codes{padding-left:1mm;gap:.8mm}
.ship-template.ship-small.ship-classic .ship-codes{padding:.4mm}
.ship-template.ship-small .ship-scan{font-size:.8em;line-height:1.5}
.ship-template.ship-small .ship-footer{font-size:.82em;gap:1mm;padding-top:.6mm;line-height:1.45}
.ship-template.ship-small .ship-bag,.ship-template.ship-small .ship-heart{width:3.5mm}
.ship-template.ship-square{--ship-base:11px;--ship-qr:29mm;--ship-label:22mm;--ship-row-gap:1.5mm}
.ship-template.ship-tall{--ship-base:13px;--ship-qr:31mm;--ship-label:23mm;--ship-row-gap:3mm}
.ship-template.ship-square .ship-brand-title,.ship-template.ship-tall .ship-brand-title{flex-direction:column;align-items:flex-start;gap:1mm}
.ship-template.ship-square .ship-heading,.ship-template.ship-tall .ship-heading{padding-left:0;border:0}
.ship-template.ship-square .ship-heading span,.ship-template.ship-tall .ship-heading span{display:inline;margin-left:1.5mm}
.ship-template.ship-tall .ship-codes{justify-content:center}
.ship-template.ship-tall .ship-details{min-height:100%;justify-content:space-between}
/* Paper selects the composition, not merely a scaled version of one layout. */
.ship-template .ship-website{display:block;font-family:Arial,sans-serif;font-size:.9em;overflow-wrap:anywhere}
.ship-template.ship-courier :is(.ship-truck,.ship-bag,.ship-heart){display:none}
/* 80 × 50 mm: one compact header, details left and square QR right. */
.ship-template.ship-small.ship-courier .ship-header{grid-template-columns:minmax(0,1fr) 30%;min-height:7mm;gap:1mm}
.ship-template.ship-small.ship-courier .ship-brand-title{flex-direction:row;align-items:center;gap:1mm}
.ship-template.ship-small.ship-courier .ship-brand{flex:1;min-width:0}
.ship-template.ship-small.ship-courier .ship-logo{width:100%;height:6mm;max-width:none}
.ship-template.ship-small.ship-courier .ship-heading{display:block;flex-shrink:0;border-left:.2mm solid #111;padding-left:1mm;font-size:.8em;line-height:1.4}
.ship-template.ship-small.ship-courier .ship-heading :is(strong,span){display:block}
.ship-template.ship-small.ship-courier .ship-order strong{font-size:.78em}
.ship-template.ship-small.ship-courier .ship-footer{text-align:center;font-size:.78em}
.ship-template.ship-small .ship-website{display:none}
.ship-template.ship-small .ship-balance-note{display:inline-block;margin-left:1mm;font-size:.74em;line-height:1.4;font-weight:400}
/* 100 × 100 mm: large logo left, bilingual heading and barcode right. */
.ship-template.ship-square.ship-courier .ship-header{grid-template-columns:minmax(0,1fr) 46%;grid-template-rows:auto auto;column-gap:2mm;row-gap:1mm}
.ship-template.ship-square.ship-courier .ship-brand-title{display:contents}
.ship-template.ship-square.ship-courier .ship-brand{grid-column:1;grid-row:1 / 3;justify-content:center;align-self:stretch;padding-right:2mm;border-right:.25mm solid #111}
.ship-template.ship-square.ship-courier .ship-logo{height:20mm;object-position:center}
.ship-template.ship-square.ship-courier .ship-store{font-size:1.7em;text-align:center}
.ship-template.ship-square.ship-courier .ship-heading{grid-column:2;grid-row:1;text-align:center}
.ship-template.ship-square.ship-courier .ship-heading span{display:block;margin:0}
.ship-template.ship-square.ship-courier .ship-order{grid-column:2;grid-row:2;text-align:center}
.ship-template.ship-square.ship-courier .ship-order strong{font-size:.9em}
.ship-template.ship-square.ship-courier .ship-order svg{height:6mm}
.ship-template.ship-square.ship-courier .ship-footer div{display:grid;grid-template-columns:minmax(0,1fr);text-align:center}
.ship-template.ship-square.ship-courier .ship-footer.ship-has-website div{width:100%;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;column-gap:2mm}
.ship-template.ship-square.ship-courier .ship-footer.ship-has-website .ship-website{grid-column:1;grid-row:1 / 3;align-self:stretch;display:flex;align-items:center;justify-content:center;border-right:.2mm solid #111;padding-right:2mm;font-size:.83em}
.ship-template.ship-square.ship-courier .ship-footer.ship-has-website :is(strong,span:not(.ship-website)){grid-column:2}
/* 100 × 150 mm: centered stacked header, full-width details, QR below. */
.ship-template.ship-tall{--ship-qr:25mm;--ship-label:28mm;--ship-row-gap:1mm}
.ship-template.ship-tall .ship-header{grid-template-columns:minmax(0,1fr);gap:1.5mm}
.ship-template.ship-tall .ship-brand-title{flex-direction:column;align-items:center;gap:1.5mm}
.ship-template.ship-tall .ship-brand{width:100%;justify-content:center}
.ship-template.ship-tall .ship-logo{width:100%;height:21mm;object-position:center}
.ship-template.ship-tall .ship-store{font-size:1.85em;text-align:center}
.ship-template.ship-tall .ship-heading{text-align:center;line-height:1.5}
.ship-template.ship-tall .ship-heading span{display:block;margin:0}
.ship-template.ship-tall .ship-order{text-align:center}
.ship-template.ship-tall .ship-order strong{font-size:.9em}
.ship-template.ship-tall .ship-order svg{height:8mm}
.ship-template.ship-tall .ship-body{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:2mm}
.ship-template.ship-tall .ship-details{min-height:0;max-height:100%;align-self:stretch;justify-content:space-between}
.ship-template.ship-tall .ship-codes{height:auto;align-self:end;flex-direction:row;align-items:center;justify-content:flex-start;border:0;border-top:.2mm dashed #888;padding:2mm 0 0;gap:4mm}
.ship-template.ship-tall .ship-scan{text-align:left;font-size:.95em;max-width:calc(100% - var(--ship-qr) - 4mm)}
.ship-template.ship-tall .ship-footer{justify-content:center;text-align:center}
.ship-template.ship-tall.ship-no-qr .ship-body{grid-template-rows:minmax(0,1fr)}
@media print{.ship-template{print-color-adjust:exact;-webkit-print-color-adjust:exact;box-shadow:none!important}.shipping-label-preview .no-print{display:none!important}}
`;
