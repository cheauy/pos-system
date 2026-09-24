import "server-only";
import { cache } from "react";
import { requirePermission } from "@/lib/auth/require-permission";
import { getBranchContext } from "./context";
import { createClient } from "@/lib/supabase/branch-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Authorizes one document only. It never grants general access to its branch.
export const authorizedOrderBranch = cache(async (businessId: string, orderId: string) => {
  const business = await requirePermission("orders.view");
  if (business.id !== businessId || !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const context = await getBranchContext();
  const { data: order, error } = await supabaseAdmin.from("orders").select("location_id,order_source").eq("id", orderId).eq("business_id", businessId).maybeSingle();
  if (error) throw new Error("Unable to verify order access.");
  if (!order?.location_id) return null;
  if (order.location_id === context.branchId) return order.location_id as string;
  if (order.order_source !== "online") return null;
  const db = await createClient();
  const scope = await db.rpc("tenh_receive_all_online_orders", { p_business: businessId });
  if (scope.error || scope.data !== true) return null;
  const branch = await supabaseAdmin.from("business_locations").select("id").eq("business_id", businessId).eq("id", order.location_id).eq("is_active", true).eq("plan_disable_pending", false).maybeSingle();
  return branch.error ? null : branch.data?.id ?? null;
});
