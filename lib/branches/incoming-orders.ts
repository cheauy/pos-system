import "server-only";
import { createClient } from "@/lib/supabase/branch-server";

type OnlineOrderItem = {
  image_url?: string | null;
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  variant_label: string | null;
  selected_options: Array<{ name?: string; priceAdjustment?: number }> | null;
};

export type OnlineOrder = {
  location_id: string;
  branch_name: string;
  id: string;
  order_number: string;
  order_source: string;
  fulfillment_type: string | null;
  online_status: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_address: string | null;
  customer_note: string | null;
  table_name: string | null;
  delivery_zone_name: string | null;
  requested_for: string | null;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  subtotal: number;
  discount: number;
  coupon_code: string | null;
  loyalty_points_earned: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  order_items: OnlineOrderItem[];
};

export async function getIncomingOrders(businessId: string) {
  const db = await createClient();
  const { data, error } = await db.rpc("tenh_incoming_online_orders", { p_business: businessId });
  if (error) throw new Error(error.code === "PGRST202" ? "Install the online-order branch update first." : error.message);
  return { orders: (data?.orders ?? []) as OnlineOrder[], receiveAll: data?.receiveAll === true };
}
