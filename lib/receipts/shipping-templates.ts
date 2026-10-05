import { validateShippingLayout, assertShippingQrSize, type ShippingLayout } from './shipping-layout';
import { shippingOrderQrMinimumMm } from './shipping-custom';
/** Shared by printer settings, the batch printer and saved-order printouts. */
export const SHIPPING_LABEL_SIZES = [
  { id: '80x50', width: 80, height: 50, label: '80 × 50 mm' },
  { id: '100x100', width: 100, height: 100, label: '100 × 100 mm' },
  { id: '100x150', width: 100, height: 150, label: '100 × 150 mm' },
] as const;
export type ShippingLabelSize = typeof SHIPPING_LABEL_SIZES[number]['id'];
export const SHIPPING_TEMPLATES = [
  { id: 'en-classic', language: 'en', layout: 'classic', name: 'Classic', description: 'Clear boxed sections with recipient details and an order QR code.' },
  { id: 'en-courier', language: 'en', layout: 'courier', name: 'Courier — Auto layout', description: 'Three paper-size layouts: compact and square with QR on the right; portrait with QR below the details.' },
  { id: 'km-classic', language: 'km', layout: 'classic', name: 'Classic — ខ្មែរ', description: 'Khmer field labels with clear boxed sections.' },
  { id: 'km-courier', language: 'km', layout: 'courier', name: 'Courier — ខ្មែរ · Auto layout', description: 'Reference-style Khmer layouts for 80 × 50, 100 × 100 and 100 × 150 mm. Portrait uses a centered header and QR below the details.' },
] as const;
export const CUSTOM_SHIPPING_TEMPLATE = { id: 'custom', language: 'en', layout: 'custom', name: 'Custom Template', description: 'Position your fields, choose text size and bold, and add an order QR code.' } as const;
export type ShippingTemplateId = typeof SHIPPING_TEMPLATES[number]['id'] | 'custom' | `custom:${string}`;
export type NamedShippingTemplate = {id:string;name:string;layout:ShippingLayout;needsReview?:boolean;revision?:number};
export function shippingTemplateName(value:unknown) {
  if(typeof value!=='string')throw new Error('Enter a template name.');
  const name=value.trim().replace(/\s+/g,' ').normalize('NFC');
  if(!name||name.length>60||/[\u0000-\u001f\u007f]/.test(name))throw new Error('Use a template name from 1 to 60 characters.');
  return name;
}
export function shippingCustomTemplates(value:unknown,repairQr=false):NamedShippingTemplate[] {
  if(value==null||value==='')return [];
  if(typeof value!=='string'||new TextEncoder().encode(value).length>65536)throw new Error('The saved template collection is too large.');
  const entries=JSON.parse(value) as NamedShippingTemplate[];
  if(!Array.isArray(entries)||entries.length>20)throw new Error('Save up to 20 named templates.');
  const ids=new Set<string>(),names=new Set<string>();
  const minimum=shippingOrderQrMinimumMm();
  return entries.map(entry=>{
    if(!entry||typeof entry.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id)||ids.has(entry.id))throw new Error('Invalid template identity.');
    const name=shippingTemplateName(entry.name),key=name.normalize('NFKC').toLowerCase();
    if(names.has(key))throw new Error('A template with that name already exists. Choose another name.');
    ids.add(entry.id);names.add(key);
    if(entry.needsReview!==undefined&&typeof entry.needsReview!=='boolean')throw new Error('Invalid template review state.');
    if(entry.revision!==undefined&&(!Number.isSafeInteger(entry.revision)||entry.revision<0))throw new Error('Invalid template revision.');
    const layout=validateShippingLayout(entry.layout,minimum,repairQr);
    let needsReview=entry.needsReview===true;
    if(repairQr)for(const element of entry.layout.elements){try{assertShippingQrSize(element,entry.layout.size,minimum);}catch{needsReview=true;}}
    return {id:entry.id,name,layout,...(needsReview?{needsReview:true}:{}),...(entry.revision!==undefined?{revision:entry.revision}:{})};
  });
}
export const SHIPPING_TEMPLATE_GROUPS = [
  { language: 'en', label: 'English Templates' },
  { language: 'km', label: 'Khmer Templates' },
] as const;
export function shippingLabelSize(value: unknown) {
  return SHIPPING_LABEL_SIZES.find(size => size.id === value) ?? SHIPPING_LABEL_SIZES[2];
}
export function shippingTemplate(value: unknown,custom?:unknown) {
  if (value === 'custom') return CUSTOM_SHIPPING_TEMPLATE;
  if(typeof value==='string'&&value.startsWith('custom:')){
    const saved=shippingCustomTemplates(custom).find(entry=>`custom:${entry.id}`===value);
    if(saved)return {...CUSTOM_SHIPPING_TEMPLATE,id:value as ShippingTemplateId,name:saved.name};
    return CUSTOM_SHIPPING_TEMPLATE;
  }
  // Legacy stores have no template key; do not silently change their language.
  return SHIPPING_TEMPLATES.find(template => template.id === value) ?? SHIPPING_TEMPLATES[0];
}
export function isShippingTemplate(value: unknown): value is ShippingTemplateId {
  return value === 'custom' || (typeof value==='string'&&/^custom:[a-zA-Z0-9_-]{1,80}$/.test(value)) || SHIPPING_TEMPLATES.some(template => template.id === value);
}
export const SHIPPING_VISIBILITY_FLAGS = ['store_name', 'store_address', 'store_phone', 'phone', 'order_number', 'cod', 'item_count', 'barcode'] as const;
export const SHIPPING_EXTRA_FLAGS = ['date', 'linear_barcode', 'logo', 'footer'] as const;
/** Validate persisted JSON without breaking settings saved before templates existed. */
export function validateShippingSettings(value: unknown, repairQr = false): Record<string, string | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid shipping settings.');
  const settings = value as Record<string, unknown>;
  if (!SHIPPING_LABEL_SIZES.some(size => size.id === settings.shipping_label_size)) throw new Error('Invalid shipping label size.');
  if (settings.shipping_template != null && !isShippingTemplate(settings.shipping_template)) throw new Error('Choose a valid shipping template.');
  const result: Record<string, string | boolean> = {
    shipping_label_size: String(settings.shipping_label_size),
    shipping_template: String(settings.shipping_template ?? 'en-classic'),
  };
  if (settings.shipping_custom_layout != null) {
    if (typeof settings.shipping_custom_layout !== 'string' || settings.shipping_custom_layout.length > 65536) throw new Error('Invalid custom shipping design.');
    const minimum = shippingOrderQrMinimumMm();
    const raw = JSON.parse(settings.shipping_custom_layout);
    const design = validateShippingLayout(raw,minimum,repairQr);
    result.shipping_custom_layout = JSON.stringify(design);
    for (const element of raw.elements) {
      try { assertShippingQrSize(element,raw.size,minimum); }
      catch (error) { if (!repairQr) throw error; result.shipping_custom_qr_needs_review = true; }
    }
  }
  if (result.shipping_template === 'custom' && !result.shipping_custom_layout) throw new Error('Save a custom shipping design first.');
  const templates=shippingCustomTemplates(settings.shipping_custom_templates,repairQr);
  if(settings.shipping_custom_templates!=null)result.shipping_custom_templates=JSON.stringify(templates);
  if(String(result.shipping_template).startsWith('custom:')){
    const selected=templates.find(entry=>`custom:${entry.id}`===result.shipping_template);
    if(!selected){
      if(!repairQr)throw new Error('The selected custom template is unavailable. Reload Printer Settings.');
      // Reads (label pages) keep every order field on the built-in layout and say so visibly.
      result.shipping_template='en-classic';result.shipping_template_unavailable=true;
    }
    else if(selected.needsReview)result.shipping_custom_qr_needs_review=true;
  }
  for (const flag of SHIPPING_VISIBILITY_FLAGS) {
    const key = `shipping_show_${flag}`;
    if (typeof settings[key] !== 'boolean') throw new Error('Invalid shipping visibility setting.');
    result[key] = settings[key];
  }
  for (const flag of SHIPPING_EXTRA_FLAGS) {
    const key = `shipping_show_${flag}`;
    if (settings[key] != null && typeof settings[key] !== 'boolean') throw new Error('Invalid shipping visibility setting.');
    result[key] = settings[key] !== false;
  }
  if(new TextEncoder().encode(JSON.stringify(result)).length>120000)throw new Error('The template collection is too large. Shorten custom text or simplify formatting.');
  return result;
}
