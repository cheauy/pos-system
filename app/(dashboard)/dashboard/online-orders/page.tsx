import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import OnlineOrdersClient, { type OnlineOrder } from "./online-orders-client";

export default async function OnlineOrdersPage() {
  const business = await requirePermission("orders.view");

  const [settings, orderResult] = await Promise.all([
    getStorefrontSettings(business.id),
    supabaseAdmin
    .from("orders")
    .select(`
      id,
      order_number,
      order_source,
      fulfillment_type,
      online_status,
      guest_name,
      guest_phone,
      guest_address,
      customer_note,
      table_name,
      delivery_zone_name,
      requested_for,
      payment_method,
      payment_status,
      payment_reference,
      subtotal,
      discount,
      coupon_code,
      loyalty_points_earned,
      delivery_fee,
      total,
      created_at,
      order_items (
        id,
        product_name,
        quantity,
        unit_price,
        variant_label,
        selected_options
      )
    `)
    .eq("business_id", business.id)
    .in("order_source", ["online", "qr"])
    .order("created_at", { ascending: false })
    .limit(100),
  ]);

  const { data, error } = orderResult;

  if (error) {
    throw new Error(`Unable to load online orders: ${error.message}`);
  }

  return (
    <OnlineOrdersClient
      businessId={business.id}
      initialOrders={(data ?? []) as OnlineOrder[]}
      currency={settings.currency}
    />
  );
}
