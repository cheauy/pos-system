 'use server';

import { PUBLIC_PHOTO_CACHE_SECONDS } from "@/lib/public-photo-cache";
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/branch-server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createAuditLog } from '@/lib/audit/create-audit-log';
import { receiptSettingsIssue, type ReceiptAppearance } from '@/lib/receipts/receipt-model';
import { getBranchContext } from '@/lib/branches/context';

async function printerBranch(businessId:string,expectedBranchId?:string){
 const context=await getBranchContext();
 if(context.business.id!==businessId||!context.branchId||(expectedBranchId&&expectedBranchId!==context.branchId))throw new Error('The selected branch changed. Reload Printer Settings before saving.');
 return context.branchId;
}

async function persistAppearance(businessId:string, a:ReceiptAppearance,expectedBranchId?:string):Promise<void> {
 const invalid=receiptSettingsIssue(a); if(invalid) throw new Error(invalid);
 const db=await createClient();
 const locationId=await printerBranch(businessId,expectedBranchId);
 const values = {
  business_id:businessId,location_id:locationId,receipt_template:a.template,paper_size:a.paperSize,receipt_logo_url:a.logoUrl,receipt_qr_url:a.qrUrl,show_receipt_qr:a.showQr,
  font_size:a.fontSize,density:a.density,receipt_alignment:a.alignment,
  header_text:a.header.trim(),footer_text:a.footer.trim(),return_policy:a.returnPolicy.trim(),
  show_logo:a.showLogo,show_phone:a.showPhone,show_address:a.showAddress,show_customer:a.showCustomer,
  ...(a.showBusinessName===undefined?{}:{show_business_name:a.showBusinessName}),
  ...(a.wifiPassword===undefined?{}:{receipt_wifi_password:a.wifiPassword}),
  ...(a.showWifi===undefined?{}:{show_receipt_wifi:a.showWifi}),
  show_discount:a.showDiscount,show_payment:a.showPayment,show_fulfillment:a.showFulfillment,show_notes:a.showNotes,
  show_order_number:a.showOrderNumber,show_loyalty:a.showLoyalty,show_cashier:a.showCashier,updated_at:new Date().toISOString(),
 };
 let {data:saved,error}=await db.from('branch_receipt_settings').upsert(values,{onConflict:'business_id,location_id'}).select('business_id,location_id').single();
 if(error && ['42703','PGRST204'].includes(error.code) && /receipt_qr_url|show_receipt_qr/.test(error.message) && !a.qrUrl) {
  const legacyValues:Record<string,unknown>={...values};delete legacyValues.receipt_qr_url;delete legacyValues.show_receipt_qr;
  ({data:saved,error}=await db.from('branch_receipt_settings').upsert(legacyValues,{onConflict:'business_id,location_id'}).select('business_id,location_id').single());
 }
 if(error) throw new Error(['42703','PGRST204'].includes(error.code)?'Apply the latest printer settings migrations first.':error.message);
 if(saved?.business_id!==businessId||saved?.location_id!==locationId)throw new Error('Could not confirm saved settings for this branch. Reload and try again.');
 // Receipt save has committed: cache/audit failure must not claim the save failed.
 try {await createAuditLog({action:'update',entityType:'business',entityId:businessId,description:'Updated receipt appearance',metadata:{template:a.template,paperSize:a.paperSize}});}catch(e){console.error('Receipt audit',e);}
 try {revalidatePath('/dashboard/settings/receipts');revalidatePath('/dashboard/settings/printers');revalidatePath('/dashboard/pos','layout');revalidatePath('/dashboard/orders','layout');revalidatePath('/dashboard/barcodes');revalidatePath('/dashboard/shipping-labels');}catch(e){console.error('Receipt cache refresh',e);}
}
export async function saveReceiptAppearance(expectedBusinessId:string, a:ReceiptAppearance,expectedBranchId?:string) {
 const business=await requirePermission('business.update');
 if(expectedBusinessId!==business.id)return {success:false as const,message:'The selected business changed. Reload Settings.'};
 try {await persistAppearance(business.id,a,expectedBranchId);return {success:true as const};}
 catch(e){return {success:false as const,message:e instanceof Error?e.message:'Could not save receipt settings.'};}
}
// Compatibility with the existing print-customization form; do not remove it.
export async function saveReceiptSettings(formData:FormData):Promise<void> {
 const business=await requirePermission('business.update');
 const {loadReceiptContext}=await import('@/lib/receipts/load-receipt-context');
 const current=(await loadReceiptContext(business.id,business.name)).appearance;
 const text=(key:string)=>String(formData.get(key) ?? '');
 const checked=(key:string)=>formData.get(key)==='on';
 const a:ReceiptAppearance={...current,template:text('receiptTemplate') as ReceiptAppearance['template'] || current.template,paperSize:text('paperSize') as ReceiptAppearance['paperSize'],
  header:text('headerText'),footer:text('footerText'),returnPolicy:text('returnPolicy'),
  fontSize:(text('fontSize')||current.fontSize) as ReceiptAppearance['fontSize'],density:(text('density')||current.density) as ReceiptAppearance['density'],alignment:(text('receiptAlignment')||current.alignment) as ReceiptAppearance['alignment'],
  showLogo:checked('showLogo'),showPhone:checked('showPhone'),showAddress:checked('showAddress'),showCustomer:checked('showCustomer'),showDiscount:checked('showDiscount'),showPayment:checked('showPayment'),showFulfillment:checked('showFulfillment'),showNotes:checked('showNotes'),showOrderNumber:checked('showOrderNumber'),showLoyalty:checked('showLoyalty'),showCashier:checked('showCashier')};
 await persistAppearance(business.id,a);
}
export async function uploadReceiptLogo(expectedBusinessId:string, form:FormData) {
 return uploadReceiptImage(expectedBusinessId,form);
}
export async function uploadReceiptQr(expectedBusinessId:string, form:FormData) {
 return uploadReceiptImage(expectedBusinessId,form);
}
async function uploadReceiptImage(expectedBusinessId:string, form:FormData) {
 const business=await requirePermission('business.update');
 if(expectedBusinessId!==business.id)return {success:false as const,message:'The selected business changed. Reload Settings.'};
 const file=form.get('logo');
 if(!(file instanceof File) || file.size===0 || file.size>750*1024)return {success:false as const,message:'Choose a PNG, JPEG or WebP image no larger than 750 KB.'};
 try {
  const bytes=new Uint8Array(await file.arrayBuffer());
  const png=bytes.length>8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  const jpg=bytes.length>3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp=bytes.length>12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!png && !jpg && !webp)return {success:false as const,message:'The file is not a supported image. SVG and HTML are not accepted.'};
  const ext=png?'png':jpg?'jpg':'webp';const contentType=png?'image/png':jpg?'image/jpeg':'image/webp';
  const db=supabaseAdmin;const path=`${business.id}/${crypto.randomUUID()}.${ext}`;
  const {error}=await db.storage.from('tenh-receipt-logos').upload(path,bytes,{contentType,upsert:false,cacheControl:PUBLIC_PHOTO_CACHE_SECONDS});
  if(error) throw new Error(`Image upload failed: ${error.message}`);
  const {data}=db.storage.from('tenh-receipt-logos').getPublicUrl(path);
  return {success:true as const,url:data.publicUrl};
 }catch(e){return {success:false as const,message:e instanceof Error?e.message:'Logo upload failed.'};}
}

// This module is shared by Receipt, Barcode Labels and Shipping Labels.
// Keep all three named Server Actions: do not replace the module with only the
// receipt action when updating the receipt settings page.
function labelChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

async function upsertLabelSettings(values: Record<string, unknown>,expectedBranchId?:string): Promise<void> {
  // Preserve the original label settings permission; never trust a business ID
  // submitted in the browser's FormData.
  const business = await requirePermission('business.update');
  const supabase = await createClient();
  const locationId=await printerBranch(business.id,expectedBranchId);
  const { data:saved,error } = await supabase.from('branch_receipt_settings').upsert(
    {
      ...values,
      business_id: business.id,
      location_id:locationId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id,location_id' },
  ).select('business_id,location_id').single();

  if (error) throw new Error(error.message);
  if(saved?.business_id!==business.id||saved?.location_id!==locationId)throw new Error('Could not confirm saved label settings.');

  revalidatePath('/dashboard/settings/receipts');revalidatePath('/dashboard/settings/printers');
  revalidatePath('/dashboard/barcodes');
  revalidatePath('/dashboard/shipping-labels');
}

export async function saveShippingLabelSettings(formData: FormData): Promise<void> {
  await persistShippingLabelSettings(formData);
}
export async function saveShippingCustomTemplate(formData: FormData): Promise<{customTemplates:string;warning?:string}> {
  if(!formData.has('shippingCustomTemplateDraft'))throw new Error('The custom template draft is unavailable.');
  return persistShippingLabelSettings(formData);
}
async function persistShippingLabelSettings(formData: FormData): Promise<{customTemplates:string;warning?:string}> {
  const { SHIPPING_LABEL_SIZES, isShippingTemplate, shippingTemplate, shippingCustomTemplates } = await import('@/lib/receipts/shipping-templates');
  const size = String(formData.get('shippingLabelSize') || '100x150');
  if (!SHIPPING_LABEL_SIZES.some(value => value.id === size)) throw new Error('Choose a valid shipping label size.');
  const business = await requirePermission('business.update');
  await printerBranch(business.id, String(formData.get('branchId') || '') || undefined);
  const { persistShippingSettings, loadShippingSettings } = await import('@/lib/receipts/shipping-design-store');
  // Older forms do not submit templates/extra flags. Keep the saved selection.
  const current = await loadShippingSettings(business.id);
  const requestedTemplate = formData.has('shippingTemplate') ? formData.get('shippingTemplate') : shippingTemplate(current?.shipping_template,current?.shipping_custom_templates).id;
  if (!isShippingTemplate(requestedTemplate)) throw new Error('Choose a valid shipping template.');
  let customTemplates=shippingCustomTemplates(current?.shipping_custom_templates);
  let namedSaved=false;
  if(formData.has('shippingCustomTemplateDraft')){
    const raw=formData.get('shippingCustomTemplateDraft');
    if(typeof raw!=='string'||raw.length>65536)throw new Error('Invalid custom template.');
    const entry=shippingCustomTemplates(JSON.stringify([JSON.parse(raw)]))[0];
    const mode=formData.get('shippingCustomTemplateMode');
    const existing=customTemplates.find(template=>template.id===entry.id);
    if(mode==='create'&&existing)throw new Error('That template identity already exists. Reload settings.');
    if(mode==='update'&&!existing)throw new Error('The template is unavailable. Reload settings.');
    if(mode==='update'){
      const original=formData.get('shippingCustomTemplateOriginal');
      if(typeof original!=='string'||original.length>65536)throw new Error('Reopen the template before saving changes.');
      const expected=shippingCustomTemplates(JSON.stringify([JSON.parse(original)]))[0];
      if(JSON.stringify(expected)!==JSON.stringify(existing))throw new Error('This template changed since you opened it. Reload settings before saving.');
    }
    if(mode!=='create'&&mode!=='update')throw new Error('Choose Save changes or Save as new.');
    if(requestedTemplate!==`custom:${entry.id}`||entry.layout.size!==size)throw new Error('The selected template or size changed. Reopen the editor.');
    // Early validation helps the editor; the database repeats uniqueness and revision CAS under its row lock.
    shippingCustomTemplates(JSON.stringify(existing?customTemplates.map(template=>template.id===entry.id?entry:template):[...customTemplates,entry]));
    const {persistShippingNamedTemplate}=await import('@/lib/receipts/shipping-template-store');
    customTemplates=await persistShippingNamedTemplate(business.id,entry,mode,existing?.revision??0,customTemplates);
    namedSaved=true;
  }
  const extraFlag = (field: string, stored: string) => formData.has('shippingTemplate') ? labelChecked(formData, field) : current?.[stored] !== false;
  let warning:string|undefined;
  try{await persistShippingSettings(business.id, {
    ...(customTemplates.length||current?.shipping_custom_templates?{shipping_custom_templates:JSON.stringify(customTemplates)}:{}),
    ...(formData.has('shippingCustomLayout') ? {shipping_custom_layout:formData.get('shippingCustomLayout')} : current?.shipping_custom_layout ? {shipping_custom_layout:current.shipping_custom_layout} : {}),
    shipping_label_size: size,
    shipping_template: requestedTemplate,
    shipping_show_store_name: labelChecked(formData, 'shippingShowStoreName'),
    shipping_show_store_address: labelChecked(formData, 'shippingShowStoreAddress'),
    shipping_show_store_phone: labelChecked(formData, 'shippingShowStorePhone'),
    shipping_show_phone: labelChecked(formData, 'shippingShowPhone'),
    shipping_show_order_number: labelChecked(formData, 'shippingShowOrderNumber'),
    shipping_show_cod: labelChecked(formData, 'shippingShowCod'),
    shipping_show_item_count: labelChecked(formData, 'shippingShowItemCount'),
    shipping_show_barcode: labelChecked(formData, 'shippingShowBarcode'),
    shipping_show_date: extraFlag('shippingShowDate', 'shipping_show_date'),
    shipping_show_linear_barcode: extraFlag('shippingShowLinearBarcode', 'shipping_show_linear_barcode'),
    shipping_show_logo: extraFlag('shippingShowLogo', 'shipping_show_logo'),
    shipping_show_footer: extraFlag('shippingShowFooter', 'shipping_show_footer'),
  });}catch(error){
    if(!namedSaved)throw error;
    // The canonical template has committed. Never turn a selection/storage failure into a misleading failed create.
    warning='The template was saved, but its default selection could not be saved. Select it again after reloading.';
  }
  revalidatePath('/dashboard/settings/printers');
  revalidatePath('/dashboard/shipping-labels');
  revalidatePath('/dashboard/orders', 'layout');
  return {customTemplates:JSON.stringify(customTemplates),...(warning?{warning}:{})};
}

export async function saveBarcodeLabelSettings(formData: FormData): Promise<void> {
  const requestedSize = String(formData.get('barcodeLabelSize'));
  const size = ['40x20', '40x30', '50x30', '60x40', '80x50'].includes(requestedSize)
    ? requestedSize
    : '50x30';
  const requestedTemplate = String(formData.get('barcodeTemplate'));
  const template = ['product', 'price'].includes(requestedTemplate)
    ? requestedTemplate
    : 'product';

  // Use the exact field names submitted by the existing Barcode Labels form.
  // Only barcode settings are included; receipt/shipping settings stay untouched.
  await upsertLabelSettings({
    barcode_label_size: size,
    barcode_template: template,
    barcode_show_name: labelChecked(formData, 'barcodeShowName'),
    barcode_show_price: labelChecked(formData, 'barcodeShowPrice'),
    barcode_show_sku: labelChecked(formData, 'barcodeShowSku'),
    barcode_show_variant: labelChecked(formData, 'barcodeShowVariant'),
    barcode_show_barcode: labelChecked(formData, 'barcodeShowBarcode'),
    barcode_show_image: labelChecked(formData, 'barcodeShowImage'),
    barcode_show_store_name: labelChecked(formData, 'barcodeShowStoreName'),
    barcode_show_custom_text: false,
    barcode_custom_text: '',
  },String(formData.get('branchId')||'')||undefined);
}
