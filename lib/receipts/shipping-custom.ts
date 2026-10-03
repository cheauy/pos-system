import { create } from 'qrcode';
import { code39Bars } from '@/lib/barcode/code39';
import { isOrderCode, orderQrSvg } from '@/lib/orders/order-qr';
import { shippingElementStyle, shippingQrMinimumMm, shippingQrModules, normalizeShippingRuns, type ShippingElement, type ShippingTextRun } from './shipping-layout';

export type ShippingValues = Record<string, string>;
/** All authorized order codes have twelve digits; never show or link this sizing probe. */
export function shippingOrderQrMinimumMm() {
  return shippingQrMinimumMm(shippingQrModules(orderQrSvg('100000000000')));
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
export function shippingRichTextMarkup(runs: ShippingTextRun[],defaultUnderline=false) {
  return normalizeShippingRuns(runs).map(run=>{
    const underline=run.underline??(defaultUnderline?true:undefined);
    const styles=[run.bold===undefined?'':`font-weight:${run.bold?700:400}`,run.italic===undefined?'':`font-style:${run.italic?'italic':'normal'}`,underline===undefined?'':`text-decoration:${underline?'underline':'none'}`,run.fontSize===undefined?'':`font-size:${run.fontSize}px`].filter(Boolean).join(';');
    return `<span${styles?` style="${styles}"`:''}>${escape(run.text)}</span>`;
  }).join('');
}
/** Deliberately not a code or link that the order scanner can resolve. */
export function shippingQr(code: unknown, sample = false) {
  if (!sample) return isOrderCode(code) ? orderQrSvg(code) : '';
  const { modules } = create('TENH SAMPLE LABEL - NOT AN ORDER', { errorCorrectionLevel: 'M' });
  const size = modules.size + 8;
  let path = '';
  for (let y=0;y<modules.size;y++) for(let x=0;x<modules.size;x++) if(modules.get(y,x)) path += `M${x+4} ${y+4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
export function shippingElementContent(element: ShippingElement, values: ShippingValues) {
  if(element.field==='text' && element.richText!==undefined)return shippingRichTextMarkup(element.richText,element.underline);
  if (element.field === 'line') return '<div style="border-top:1px solid black;width:100%;margin-top:1px"></div>';
  if (element.field === 'qr') return values.qr || '';
  if (element.field === 'barcode') {
    const value = values.orderNumber || '';
    const code = code39Bars(value);
    if (!value || value.length > 40 || code.text !== value.toUpperCase()) return '';
    return `<svg width="100%" height="100%" viewBox="0 0 ${code.width+40} 44" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="100%" height="44" fill="white"/>${code.bars.map(bar=>`<rect x="${bar.x+20}" y="0" width="${bar.width}" height="44" fill="black"/>`).join('')}</svg>`;
  }
  return escape(element.field === 'text' ? element.text : values[element.field] || '');
}
export function shippingElementMarkup(element: ShippingElement, values: ShippingValues) {
  const style = Object.entries(shippingElementStyle(element)).map(([key,value])=>`${key.replace(/[A-Z]/g, letter=>`-${letter.toLowerCase()}`)}:${value}`).join(';');
  const accessible = element.field === 'qr' ? ' role="img" aria-label="Order QR code"' : element.field === 'barcode' ? ' role="img" aria-label="Order barcode"' : '';
  return `<div data-custom-field="${element.field}"${accessible} style="${style}">${shippingElementContent(element,values)}</div>`;
}
