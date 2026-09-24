import "server-only";
import { createClient } from "@/lib/supabase/branch-server";
import type { OnlineOrder } from "@/app/(dashboard)/dashboard/online-orders/online-orders-client";

export async function getIncomingOrders(businessId: string) {
  const db = await createClient();
  const { data, error } = await db.rpc("tenh_incoming_online_orders", { p_business: businessId });
  if (error) throw new Error(error.code === "PGRST202" ? "Install the online-order branch update first." : error.message);
  return { orders: (data?.orders ?? []) as OnlineOrder[], receiveAll: data?.receiveAll === true };
}
