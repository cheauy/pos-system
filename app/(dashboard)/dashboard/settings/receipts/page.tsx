import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { getSubdomainUrl } from "@/lib/tenancy/domain";
import PrintCustomizationClient from "./print-customization-client";

const defaults={paper_size:"80mm",receipt_template:"classic",header_text:"",footer_text:"Thank you for your purchase!",return_policy:"",website_url:"",show_logo:true,show_phone:true,show_address:true,show_cashier:true,show_customer:true,show_discount:true,show_payment:true,show_loyalty:true,show_store_qr:true,show_order_number:true,show_fulfillment:true,show_notes:false,show_invoice_barcode:false,store_qr_label:"Order online",font_size:"medium",density:"comfortable",receipt_alignment:"center",receipt_copies:1,shipping_label_size:"100x150",shipping_show_sender:true,shipping_show_phone:true,shipping_show_order_number:true,shipping_show_cod:true,shipping_show_item_count:true,shipping_show_barcode:true,barcode_label_size:"40x30",barcode_show_name:true,barcode_show_price:true,barcode_show_sku:true,barcode_show_variant:true};
export default async function Page(){
 const business=await requirePermission("business.update"); const supabase=await createClient();
 const [{data:settings},{data:storefront}]=await Promise.all([
  supabase.from("business_receipt_settings").select("*").eq("business_id",business.id).maybeSingle(),
  supabase.from("business_storefronts").select("display_name,logo_url,phone,address").eq("business_id",business.id).maybeSingle(),
 ]);
 return <PrintCustomizationClient business={{name:business.name,slug:business.slug,storeUrl:getSubdomainUrl(business.slug)}} settings={{...defaults,...(settings??{})}} storefront={{display_name:storefront?.display_name??business.name,logo_url:storefront?.logo_url??null,phone:storefront?.phone??null,address:storefront?.address??null}}/>;
}
