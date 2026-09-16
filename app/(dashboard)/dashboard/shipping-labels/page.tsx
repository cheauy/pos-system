import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import ShippingLabelsClient from "./shipping-labels-client";
export default async function Page(){
 const business=await requirePermission("orders.view"); const supabase=await createClient();
 const [{data:orders,error},{data:storefront},{data:settings}]=await Promise.all([
  supabase.from("orders").select("id,order_number,total,payment_method,payment_status,guest_name,guest_phone,guest_address,fulfillment_type,created_at,customers(name,phone,address),order_items(quantity)").eq("business_id",business.id).or("fulfillment_type.eq.delivery,guest_address.not.is.null").order("created_at",{ascending:false}).limit(100),
  supabase.from("business_storefronts").select("display_name,phone,address").eq("business_id",business.id).maybeSingle(),
  supabase.from("business_receipt_settings").select("shipping_label_size,shipping_show_sender,shipping_show_phone,shipping_show_order_number,shipping_show_cod,shipping_show_item_count,shipping_show_barcode").eq("business_id",business.id).maybeSingle(),
 ]);
 if(error) throw new Error(error.message);
 return <ShippingLabelsClient businessName={storefront?.display_name??business.name} businessPhone={storefront?.phone??""} businessAddress={storefront?.address??""} orders={(orders??[]) as any[]} settings={settings??{}}/>;
}
