import { isOrderCode, orderQrSvg } from '@/lib/orders/order-qr';
import { printTextScale, type ReceiptContext } from '@/lib/receipts/receipt-model';
import { one, type DetailedOrder } from '@/app/(dashboard)/dashboard/orders/[id]/order-detail-model';
import { escapeHtml as e } from './receipt-html';

export function mobileShippingHtml(order: DetailedOrder, context: ReceiptContext, settings: Record<string, unknown>, currency: string) {
  const customer = one(order.customers);
  const code = (order as { order_code?: string | null }).order_code;
  const address = order.guest_address || customer?.address || '';
  if (!address.trim()) throw new Error('Add the delivery address before printing a shipping label.');
  const size = ['80x50', '100x100', '100x150'].includes(String(settings.shipping_label_size)) ? String(settings.shipping_label_size) : '100x150';
  const [width, height] = size.split('x').map(Number);
  const compact = height <= 100 || settings.density === 'compact';
  const name = order.guest_name || customer?.name || 'Customer', phone = order.guest_phone || customer?.phone || '';
  const showSender = (field: string) => settings[`shipping_show_store_${field}`] ?? settings.shipping_show_sender ?? true;
  const amount = (value: number) => e(new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value) || 0));
  const p = (label: string, value: string) => `<p>${e(label)}${e(value)}</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page{size:${width}mm ${height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}
    article{width:${width}mm;min-height:${height}mm;padding:${compact ? 2 : 4}mm;font:${(compact ? 10 : 12) * printTextScale(settings.font_size)}px/${compact ? 1.2 : 1.5} Arial,sans-serif;overflow-wrap:anywhere;display:grid;grid-template-columns:minmax(0,1fr) ${settings.shipping_show_barcode !== false ? "26mm" : "0"};column-gap:2mm;align-items:start;align-content:start}
    h2,p{margin:0 0 ${height===50 ? 1 : 3}px}h2{font-size:1.3em}.recipient{font-size:${height===50 ? 1.15 : 1.4}em;font-weight:700}hr{border:0;border-top:1px solid #000;margin:${height===50 ? 2 : compact ? 3 : 8}px 0}
    .details{display:${height===50 ? "grid" : "flex"};grid-template-columns:1fr 1fr;flex-wrap:wrap;gap:${height===50 ? 2 : 8}px}.details p{flex:1 1 40%}.details p:last-child{grid-column:1/-1}
  </style></head><body><article>
    <section>
    ${showSender('name') || showSender('address') || showSender('phone') ? '<p><strong>Sender:</strong></p>' : ''}
    ${showSender('name') ? `<h2>${e(context.store.name)}</h2>` : ''}
    ${showSender('address') && context.store.address ? p('Address: ', context.store.address) : ''}
    ${showSender('phone') && context.store.phone ? p('Tel: ', context.store.phone) : ''}<hr>
    <p class="recipient">Customer Name: ${e(name)}</p>${settings.shipping_show_phone !== false && phone ? p('Tel: ', phone) : ''}${p('Address: ', address)}<hr>
    </section>${settings.shipping_show_barcode !== false && isOrderCode(code) ? `<div style="width:26mm;height:26mm">${orderQrSvg(code)}</div>` : ""}
    <div class="details" style="grid-column:1/-1">${settings.shipping_show_order_number !== false ? p('Order: ', isOrderCode(code) ? code : order.order_number) : ''}
    ${settings.shipping_show_item_count !== false ? p('Items: ', String(order.order_items.reduce((sum, item) => sum + Number(item.quantity), 0))) : ''}
    ${settings.shipping_show_cod !== false ? `${p('Payment: ', order.payment_method)}<p>Total: ${amount(order.total)}</p><p>Balance due: ${amount(order.remaining_balance)}</p>` : ''}</div>
  </article></body></html>`;
  return { html, width: width * 72 / 25.4, height: height * 72 / 25.4, size };
}
