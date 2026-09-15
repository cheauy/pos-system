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
      order_number,
      online_status,
      fulfillment_type,
      total,
      created_at,
      table_name
    `)
    .eq("public_order_token", token)
    .in("order_source", ["online", "qr"])
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load order status: ${error.message}`);
  }

  if (!data) notFound();

  return <OrderStatusClient token={token} initialOrder={data} />;
}
