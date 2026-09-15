import { notFound } from "next/navigation";

import { supabaseAdmin } from "@/lib/supabase/admin";
import OrderStatusClient from "./order-status-client";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PublicOrderStatusPage({ params }: PageProps) {
  const { token } = await params;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(`
      business_id,
      order_number,
      online_status,
      fulfillment_type,
      discount,
      coupon_code,
      loyalty_points_earned,
      total,
      created_at,
      table_name,
      delivery_zone_name,
      requested_for,
      payment_method,
      payment_status,
      payment_reference
    `)
    .eq("public_order_token", token)
    .in("order_source", ["online", "qr"])
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load order status: ${error.message}`);
  }

  if (!data) notFound();

  const { business_id, ...publicOrder } = data;

  const { data: storefront } = await supabaseAdmin
    .from("business_storefronts")
    .select("currency")
    .eq("business_id", business_id)
    .maybeSingle();

  return (
    <OrderStatusClient
      token={token}
      initialOrder={{
        ...publicOrder,
        currency: storefront?.currency ?? "USD",
      }}
    />
  );
}
