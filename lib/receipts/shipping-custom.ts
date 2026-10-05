import { create } from 'qrcode';
import { code39Bars } from '@/lib/barcode/code39';
import { isOrderCode, orderQrSvg } from '@/lib/orders/order-qr';
import { receiptLogoUrl } from '@/lib/receipts/receipt-model';
import { shippingElementStyle, shippingQrMinimumMm, shippingQrModules, normalizeShippingRuns, SHIPPING_TEXT_TAGS, type ShippingElement, type ShippingTextRun } from './shipping-layout';

export type ShippingValues = Record<string, string>;
/** All authorized order codes have twelve digits; never show or link this sizing probe. */
export function shippingOrderQrMinimumMm() {
  return shippingQrMinimumMm(shippingQrModules(orderQrSvg('100000000000')));
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
/** Tags remain stored as text; only rendering substitutes order data, once and without HTML. */
export function shippingTagRuns(runs:ShippingTextRun[],values:ShippingValues):ShippingTextRun[] {
  const source=normalizeShippingRuns(runs),text=source.map(run=>run.text).join(''),result:ShippingTextRun[]=[];
  const tags=new Map(SHIPPING_TEXT_TAGS.map(({field,tag})=>[tag.toLowerCase(),field]));
  function slice(start:number,end:number){
    let offset=0;const fragments:ShippingTextRun[]=[];
    for(const run of source){const from=Math.max(0,start-offset),to=Math.min(run.text.length,end-offset);if(from<to)fragments.push({...run,text:run.text.slice(from,to)});offset+=run.text.length;}
    return fragments;
  }
  let cursor=0;
  for(const match of text.matchAll(/\{\{([^{}\n]+)\}\}|\{([^{}\n]+)\}/g)){
    const field=tags.get(match[1]!==undefined?`{{${match[1].trim().toLowerCase()}}}`:`{${match[2].trim().toLowerCase()}}`);if(!field)continue;
    result.push(...slice(cursor,match.index),{...slice(match.index,match.index+1)[0],text:values[field]??''});cursor=match.index+match[0].length;
  }
  result.push(...slice(cursor,text.length));return result;
}
export function shippingRichTextMarkup(runs: ShippingTextRun[],defaultUnderline=false,values?:ShippingValues) {
  // The 300-character bound applies to the authored template, not expanded customer addresses.
  return (values?shippingTagRuns(runs,values):normalizeShippingRuns(runs)).map(run=>{
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
export function shippingElementContent(element: ShippingElement, values: ShippingValues, showPlaceholders=false) {
  if(element.hidden)return '';
  if(showPlaceholders){
    if(element.field==='text')return element.richText!==undefined?shippingRichTextMarkup(element.richText,element.underline):escape(element.text);
    const tag=SHIPPING_TEXT_TAGS.find(option=>option.field===element.field&&option.tag.startsWith('{{'));
    if(tag)return escape(tag.tag);
  }
  if(element.field==='logo'){
    const url=receiptLogoUrl(element.text||values.logo);
    return url?`<img src="${escape(url)}" alt="${escape(values.storeName||'Shop logo')}" style="width:100%;height:100%;object-fit:contain" loading="eager"/>`:'';
  }
  if(element.field==='text' && element.richText!==undefined)return shippingRichTextMarkup(element.richText,element.underline,values);
  if(element.field==='text' && element.text.includes('{'))return shippingRichTextMarkup([{text:element.text}],element.underline,values);
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
  if(element.hidden)return '';
  const style = Object.entries(shippingElementStyle(element)).map(([key,value])=>`${key.replace(/[A-Z]/g, letter=>`-${letter.toLowerCase()}`)}:${value}`).join(';');
  const accessible = element.field === 'qr' ? ' role="img" aria-label="Order QR code"' : element.field === 'barcode' ? ' role="img" aria-label="Order barcode"' : '';
  return `<div data-custom-field="${element.field}"${accessible} style="${style}">${shippingElementContent(element,values)}</div>`;
}
