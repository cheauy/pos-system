"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { loadOrderDetail } from "./order-workspace-data";
import type { ActionResult, EditOrderInput, OrderDetail } from "./order-workspace-types";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function validId(value: unknown): value is string { return typeof value === "string" && uuid.test(value); }
function refreshOrderPaths(id: string) {
  for (const path of ["/dashboard", "/dashboard/orders", "/dashboard/online-orders", `/dashboard/orders/${id}`, `/dashboard/orders/${id}/receipt`, `/dashboard/orders/${id}/shipping-label`, "/dashboard/shipping-labels", "/dashboard/products", "/dashboard/inventory", "/dashboard/reports"]) revalidatePath(path);
}
export async function getOrderWorkspaceDetail(orderId: string, expectedBusinessId: string): Promise<ActionResult<OrderDetail>> {
  // Keep authorization redirects outside error handling.
  const business = await requirePermission("orders.view");
  if (expectedBusinessId !== business.id) return { success: false, message: "Your selected business changed. Reload the page before continuing." };
  if (!validId(orderId)) return { success: false, message: "Invalid order." };
  try { return { success: true, data: await loadOrderDetail(business.id, orderId) }; }
  catch (error) { return { success: false, message: error instanceof Error ? error.message : "Unable to load order." }; }
}

// Not exported: only the three purpose-specific async server actions are public.
async function manageOrder(businessId: string, orderId: string, updatedAt: string | null, action: string, payload: Record<string, unknown>): Promise<ActionResult> {
  if (!validId(orderId)) return { success: false, message: "Invalid order." };
  if (updatedAt !== null && (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt)))) return { success: false, message: "Invalid order version. Refresh and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("tenh_manage_order", {
    p_business_id: businessId, p_order_id: orderId, p_expected_updated_at: updatedAt,
    p_action: action, p_payload: payload,
  });
  if (error) {
    console.error("Order action:", error.code, error.message);
    return { success: false, message: error.code === "PGRST202"
      ? "Run the included Orders workspace SQL migration before editing orders."
      : error.code === "P0001" || error.code === "40001" || error.code === "42501" ? error.message
      : "The order could not be changed. Refresh and try again; no changes from this action were committed." };
  }
  refreshOrderPaths(orderId);
  return { success: true, data: undefined, message: action === "delete" ? "Order deleted from the list. Transaction history is retained." : action === "edit" ? "Order details saved." : "Order status updated." };
}
export async function saveOrderWorkspaceDetails(orderId: string, updatedAt: string | null, input: EditOrderInput, expectedBusinessId: string): Promise<ActionResult> {
  const business = await requirePermission("orders.update");
  if (business.id !== expectedBusinessId) return { success: false, message: "Your selected business changed. Reload this page." };
  if (!input || typeof input !== "object" || typeof input.note !== "string") return { success: false, message: "Invalid order details." };
  return manageOrder(business.id, orderId, updatedAt, "edit", { ...input });
}
export async function changeOrderWorkspaceStatus(orderId: string, updatedAt: string | null, status: string, reason: string, expectedBusinessId: string): Promise<ActionResult> {
  const business = await requirePermission(status === "cancelled" ? "orders.cancel" : "orders.update");
  if (business.id !== expectedBusinessId) return { success: false, message: "Your selected business changed. Reload this page." };
  if (!["pending", "in_progress", "accepted", "preparing", "ready", "completed", "cancelled"].includes(status)) return { success: false, message: "Invalid status." };
  return manageOrder(business.id, orderId, updatedAt, "status", { status, reason });
}
export async function cancelOrderWorkspaceItem(orderId: string, itemId: string, updatedAt: string | null, reason: string, expectedBusinessId: string): Promise<ActionResult> {
  const business = await requirePermission("orders.cancel");
  if (business.id !== expectedBusinessId) return { success: false, message: "Your selected business changed. Reload this page." };
  if (!validId(orderId) || !validId(itemId) || !updatedAt || !Number.isFinite(Date.parse(updatedAt))) return { success: false, message: "Refresh the order before cancelling an item." };
  if (!reason.trim() || reason.length > 500) return { success: false, message: "Enter a cancellation reason (maximum 500 characters)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("tenh_cancel_order_item", {
    p_business_id: business.id, p_order_id: orderId, p_item_id: itemId,
    p_expected_updated_at: updatedAt, p_reason: reason.trim(),
  });
  if (error) return { success: false, message: ["P0001", "40001", "42501"].includes(error.code) ? error.message : "The item could not be cancelled. Refresh and try again." };
  refreshOrderPaths(orderId);
  return { success: true, data: undefined, message: "Item cancelled and stock restored." };
}
// Same stock-restoring procedure as the order page's Cancel Order, but returns a
// result instead of redirecting so the Orders panel can stay open.
export async function cancelOrderWorkspaceOrder(orderId: string, reason: string, expectedBusinessId: string): Promise<ActionResult> {
  const business = await requirePermission("orders.cancel");
  if (business.id !== expectedBusinessId) return { success: false, message: "Your selected business changed. Reload this page." };
  if (!validId(orderId)) return { success: false, message: "Invalid order." };
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) return { success: false, message: "Enter a cancellation reason (maximum 500 characters)." };
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("id,order_number").eq("id", orderId).eq("business_id", business.id).maybeSingle();
  if (!order) return { success: false, message: "Order not found in this branch." };
  const { error } = await supabase.rpc("tenh_run_branch_stock", { p_business: business.id, p_operation: "cancel_order", p_payload: { p_order_id: orderId, p_reason: reason.trim() } });
  if (error) return { success: false, message: ["P0001", "40001", "42501"].includes(error.code ?? "") ? error.message : "The order could not be cancelled. Refresh and try again; nothing was changed." };
  await createAuditLog({ action: "cancel", entityType: "order", entityId: order.id, description: `Cancelled order ${order.order_number}`, metadata: { reason: reason.trim() } })
    .catch(() => console.error("Order cancelled; audit log failed."));
  try { refreshOrderPaths(orderId); } catch { /* Cancelled already; cache refresh is best effort. */ }
  return { success: true, data: undefined, message: `Order ${order.order_number} cancelled. Stock was restored.` };
}
export async function deleteOrderWorkspaceOrder(orderId: string, updatedAt: string | null, reason: string, expectedBusinessId: string): Promise<ActionResult> {
  const business = await requirePermission("orders.cancel");
  if (business.id !== expectedBusinessId) return { success: false, message: "Your selected business changed. Reload this page." };
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) return { success: false, message: "Please enter a deletion reason (maximum 500 characters)." };
  return manageOrder(business.id, orderId, updatedAt, "delete", { reason: reason.trim() });
}
