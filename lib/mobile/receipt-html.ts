import { printTextScale, receiptLogoUrl, type ReceiptContext } from '@/lib/receipts/receipt-model';
import type { SaleReceipt } from '@/app/(dashboard)/dashboard/pos/pos-workspace-types';

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
export function mobileReceiptHtml(receipt: SaleReceipt, context: ReceiptContext, origin: string) {
  const a = context.appearance, r = receipt, e = escapeHtml;
  const money = (amount: number) => e(new Intl.NumberFormat('en-US', { style: 'currency', currency: r.currency }).format(amount));
  const row = (label: string, value: string) => `<div class="row"><span>${e(label)}</span><span>${value}</span></div>`;
  const paragraph = (value: string) => value ? `<p>${e(value)}</p>` : '';
  const image = (url: string | null, className: string) => {
    const safe = receiptLogoUrl(url);
    return safe ? `<img class="${className}" src="${e(new URL(safe, origin).href)}" alt="${className}"/>` : '';
  };
  const width = parseInt(a.paperSize, 10) - 6;
  const separator = `<div class="separator">${'*'.repeat(80)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page{margin:3mm}*{box-sizing:border-box}body{width:${width}mm;max-width:100%;margin:0 auto;color:#000;background:#fff;font:${12 * printTextScale(a.fontSize)}px/${a.density === 'compact' ? 1.25 : 1.5} Arial,sans-serif}
    header,footer{text-align:${a.alignment}}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}h2{font-size:18px;margin:4px 0}.row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.row span:last-child{text-align:right}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:4px 2px;overflow-wrap:anywhere}td:last-child,th:last-child{text-align:right}tr{break-inside:avoid}small{display:block}.total{font-size:16px;font-weight:400}
    .separator{overflow:hidden;white-space:nowrap;font:12px monospace;width:100%;margin:8px 0}.logo{max-width:40mm;max-height:24mm;object-fit:contain}.qr{display:block;width:100%;max-width:80mm;height:auto;margin:8px auto;image-rendering:crisp-edges;break-inside:avoid}
  </style></head><body><header>
    ${a.showLogo ? image(a.logoUrl, 'logo') : ''}
    ${a.showBusinessName ? `<h2>${e(r.businessName)}</h2>` : ''}
    ${a.showAddress ? paragraph(context.store.address) : ''}${a.showPhone ? paragraph(`Tel: ${context.store.phone}`) : ''}
    ${a.showWifi && a.wifiPassword ? paragraph(`Wi-Fi password: ${a.wifiPassword}`) : ''}${paragraph(a.header)}
    ${separator}${a.showOrderNumber ? row('Order', e(r.orderNumber)) : ''}${row('Date', e(new Date(r.createdAt).toLocaleString('en-GB', { timeZone: r.timezone || 'Asia/Phnom_Penh' })))}
    ${a.showCashier && r.cashierName ? row('Cashier', e(r.cashierName)) : ''}${a.showCustomer ? row('Customer', e(r.customerName)) : ''}
    ${a.showFulfillment && r.shipping ? paragraph(`${r.shipping.method}\n${r.shipping.recipientName}\n${r.shipping.phone}\n${r.shipping.address}`) : ''}
  </header>${separator}<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
    ${r.lines.map(line => `<tr><td>${e(line.name)}${line.variant ? `<small>${e(line.variant)}</small>` : ''}${(line.options ?? []).map(option => `<small>${e(option.name)}</small>`).join('')}</td><td>${e(line.quantity)}</td><td>${money(line.unitPrice)}</td><td>${money(line.subtotal)}</td></tr>`).join('')}
  </tbody></table>${separator}${row('Subtotal', money(r.subtotal))}${a.showDiscount ? row('Discount', money(r.discount)) : ''}${r.taxAmount ? row('Tax', money(r.taxAmount)) : ''}${row('Delivery', money(r.deliveryFee))}
  <div class="total">${separator}${row('Total', money(r.total))}${separator}</div>
  ${a.showPayment ? `${(r.tenders ?? []).map(tender => row(tender.method, money(tender.amount))).join('')}${row('Received', money(r.amountPaid))}${row('Change', money(r.change))}${row('Balance', money(r.remaining))}` : ''}
  ${a.showLoyalty ? paragraph(`Points earned: ${r.pointsEarned} · Used: ${r.pointsRedeemed}`) : ''}${a.showNotes ? paragraph(r.note) : ''}
  ${separator}<footer>${a.showQr ? image(a.qrUrl, 'qr') : ''}${paragraph(a.footer)}${paragraph(a.returnPolicy)}<small>${r.isOrderRecord ? 'Current order record' : 'Original sale record'} · TENH POS</small></footer></body></html>`;
}
