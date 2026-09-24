 'use server';

import { PUBLIC_PHOTO_CACHE_SECONDS } from "@/lib/public-photo-cache";
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/branch-server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createAuditLog } from '@/lib/audit/create-audit-log';
import { receiptSettingsIssue, type ReceiptAppearance } from '@/lib/receipts/receipt-model';

async function persistAppearance(businessId:string, a:ReceiptAppearance):Promise<void> {
 const invalid=receiptSettingsIssue(a); if(invalid) throw new Error(invalid);
 const db=await createClient();
 const values = {
  business_id:businessId,receipt_template:a.template,paper_size:a.paperSize,receipt_logo_url:a.logoUrl,receipt_qr_url:a.qrUrl,show_receipt_qr:a.showQr,
  header_text:a.header.trim(),footer_text:a.footer.trim(),return_policy:a.returnPolicy.trim(),
  show_logo:a.showLogo,show_phone:a.showPhone,show_address:a.showAddress,show_customer:a.showCustomer,
  show_discount:a.showDiscount,show_payment:a.showPayment,show_fulfillment:a.showFulfillment,show_notes:a.showNotes,
  show_order_number:a.showOrderNumber,show_loyalty:a.showLoyalty,show_cashier:a.showCashier,updated_at:new Date().toISOString(),
 };
 let {error}=await db.from('branch_receipt_settings').upsert(values,{onConflict:'business_id,location_id'});
 if(error && ['42703','PGRST204'].includes(error.code) && /receipt_qr_url|show_receipt_qr/.test(error.message) && !a.qrUrl) {
  const legacyValues:Record<string,unknown>={...values};delete legacyValues.receipt_qr_url;delete legacyValues.show_receipt_qr;
  ({error}=await db.from('branch_receipt_settings').upsert(legacyValues,{onConflict:'business_id,location_id'}));
 }
 if(error) throw new Error(['42703','PGRST204'].includes(error.code)?'Apply the printer paper and receipt QR migration first.':error.message);
 // Receipt save has committed: cache/audit failure must not claim the save failed.
 try {await createAuditLog({action:'update',entityType:'business',entityId:businessId,description:'Updated receipt appearance',metadata:{template:a.template,paperSize:a.paperSize}});}catch(e){console.error('Receipt audit',e);}
 try {revalidatePath('/dashboard/settings/receipts');revalidatePath('/dashboard/settings/printers');revalidatePath('/dashboard/pos');revalidatePath('/dashboard/orders','layout');}catch(e){console.error('Receipt cache refresh',e);}
}
export async function saveReceiptAppearance(expectedBusinessId:string, a:ReceiptAppearance) {
 const business=await requirePermission('business.update');
 if(expectedBusinessId!==business.id)return {success:false as const,message:'The selected business changed. Reload Settings.'};
 try {await persistAppearance(business.id,a);return {success:true as const};}
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

async function upsertLabelSettings(values: Record<string, unknown>): Promise<void> {
  // Preserve the original label settings permission; never trust a business ID
  // submitted in the browser's FormData.
  const business = await requirePermission('business.update');
  const supabase = await createClient();
  const { error } = await supabase.from('branch_receipt_settings').upsert(
    {
      ...values,
      business_id: business.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id,location_id' },
  );

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings/receipts');revalidatePath('/dashboard/settings/printers');
  revalidatePath('/dashboard/barcodes');
  revalidatePath('/dashboard/shipping-labels');
}

export async function saveShippingLabelSettings(formData: FormData): Promise<void> {
  const requestedSize = String(formData.get('shippingLabelSize'));
  const size = ['80x50', '100x100', '100x150'].includes(requestedSize)
    ? requestedSize
    : '100x150';

  const business=await requirePermission('business.update');
  const {persistShippingSettings}=await import('@/lib/receipts/shipping-design-store');
  await persistShippingSettings(business.id,{
    shipping_label_size:size,
    shipping_show_store_name:labelChecked(formData,'shippingShowStoreName'),
    shipping_show_store_address:labelChecked(formData,'shippingShowStoreAddress'),
    shipping_show_store_phone:labelChecked(formData,'shippingShowStorePhone'),
    shipping_show_phone:labelChecked(formData,'shippingShowPhone'),
    shipping_show_order_number:labelChecked(formData,'shippingShowOrderNumber'),
    shipping_show_cod:labelChecked(formData,'shippingShowCod'),
    shipping_show_item_count:labelChecked(formData,'shippingShowItemCount'),
    shipping_show_barcode:labelChecked(formData,'shippingShowBarcode'),
  });
  revalidatePath('/dashboard/settings/printers');
  revalidatePath('/dashboard/shipping-labels');
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
  });
}
