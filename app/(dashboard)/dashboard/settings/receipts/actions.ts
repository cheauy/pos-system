"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

const checked=(fd:FormData,k:string)=>fd.get(k)==="on";
const text=(fd:FormData,k:string,max=500)=>String(fd.get(k)??"").trim().slice(0,max);
async function upsert(values:Record<string,unknown>){
  const business=await requirePermission("business.update");
  const supabase=await createClient();
  const {error}=await supabase.from("business_receipt_settings").upsert({business_id:business.id,...values,updated_at:new Date().toISOString()},{onConflict:"business_id"});
  if(error) throw new Error(error.message);
  revalidatePath("/dashboard/settings/receipts");
  revalidatePath("/dashboard/barcodes");
  revalidatePath("/dashboard/shipping-labels");
}
export async function saveReceiptSettings(fd:FormData){
  const paper=String(fd.get("paperSize")||"80mm")==="58mm"?"58mm":"80mm";
  const template=["classic","compact","minimal"].includes(String(fd.get("receiptTemplate")))?String(fd.get("receiptTemplate")):"classic";
  const font=["small","medium","large"].includes(String(fd.get("fontSize")))?String(fd.get("fontSize")):"medium";
  const density=String(fd.get("density"))==="compact"?"compact":"comfortable";
  const alignment=String(fd.get("receiptAlignment"))==="left"?"left":"center";
  const copies=Math.min(5,Math.max(1,Number(fd.get("receiptCopies")||1)));
  await upsert({paper_size:paper,receipt_template:template,header_text:text(fd,"headerText"),footer_text:text(fd,"footerText"),return_policy:text(fd,"returnPolicy"),website_url:text(fd,"websiteUrl",250),show_logo:checked(fd,"showLogo"),show_phone:checked(fd,"showPhone"),show_address:checked(fd,"showAddress"),show_cashier:checked(fd,"showCashier"),show_customer:checked(fd,"showCustomer"),show_discount:checked(fd,"showDiscount"),show_payment:checked(fd,"showPayment"),show_loyalty:checked(fd,"showLoyalty"),show_store_qr:checked(fd,"showStoreQr"),show_order_number:checked(fd,"showOrderNumber"),show_fulfillment:checked(fd,"showFulfillment"),show_notes:checked(fd,"showNotes"),show_invoice_barcode:checked(fd,"showInvoiceBarcode"),store_qr_label:text(fd,"storeQrLabel",80)||"Order online",font_size:font,density,receipt_alignment:alignment,receipt_copies:copies});
}
export async function saveShippingLabelSettings(fd:FormData){
  const size=["100x150","105x148","148x210"].includes(String(fd.get("shippingLabelSize")))?String(fd.get("shippingLabelSize")):"100x150";
  await upsert({shipping_label_size:size,shipping_show_sender:checked(fd,"shippingShowSender"),shipping_show_phone:checked(fd,"shippingShowPhone"),shipping_show_order_number:checked(fd,"shippingShowOrderNumber"),shipping_show_cod:checked(fd,"shippingShowCod"),shipping_show_item_count:checked(fd,"shippingShowItemCount"),shipping_show_barcode:checked(fd,"shippingShowBarcode")});
}
export async function saveBarcodeLabelSettings(fd:FormData){
  const size=["40x20","40x30","50x30","50x40"].includes(String(fd.get("barcodeLabelSize")))?String(fd.get("barcodeLabelSize")):"40x30";
  await upsert({barcode_label_size:size,barcode_show_name:checked(fd,"barcodeShowName"),barcode_show_price:checked(fd,"barcodeShowPrice"),barcode_show_sku:checked(fd,"barcodeShowSku"),barcode_show_variant:checked(fd,"barcodeShowVariant")});
}
