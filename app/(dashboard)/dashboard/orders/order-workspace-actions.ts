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
  if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) return { success: false, message: "Invalid order version. Refresh and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("tenh_manage_order", {
    p_business_id: businessId, p_order_id: orderId, p_expected_updated_at: updatedAt,
    p_action: action, p_payload: payload,
  });
  if (error) {
    console.error("Order action:", error.code, error.message);
    // PT409 (HTTP 409) is a definite stale-version conflict: nothing changed and it is
    // never retried here; the message tells the user to refresh. 40001 stays for databases
    // that predate migration 20261007174209.
    return { success: false, message: error.code === "PGRST202"
      ? "Run the included Orders workspace SQL migration before editing orders."
      : error.code === "PT409" ? error.message || "This order changed since you opened it. Refresh and try again."
      : error.code === "P0001" || error.code === "40001" || error.code === "42501" ? error.message
      : `The order result could not be confirmed. Refresh and check its current state before retrying.${error.code ? ` (Error ${error.code})` : ""}` };
  }
  try { refreshOrderPaths(orderId); } catch { console.error("Order change committed; cache refresh failed."); }
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
  if (business.id !== expectedBusinessId) return { success: false, status: 403, message: "Your selected business changed. Reload this page." };
  if (!validId(orderId) || !validId(itemId) || typeof updatedAt !== "string" || !updatedAt || !Number.isFinite(Date.parse(updatedAt))) return { success: false, status: 400, message: "Refresh the order before cancelling an item." };
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) return { success: false, status: 400, message: "Enter a cancellation reason (maximum 500 characters)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("tenh_cancel_order_item", {
    p_business_id: business.id, p_order_id: orderId, p_item_id: itemId,
    p_expected_updated_at: updatedAt, p_reason: reason.trim(),
  });
  if (error) {
    // Only this exact legacy guard is a version conflict; real 40001 failures stay server errors.
    const conflict = error.code === "PT409" || error.code === "40001" && error.message === "This order changed. Refresh before cancelling an item.";
    const status = conflict ? 409 : error.code === "42501" ? 403 : ["28000", "28P01", "PGRST301", "PGRST302"].includes(error.code) ? 401
      : error.code === "P0001" || error.code?.startsWith("22") ? 400 : 503;
    return { success: false, status, message: status === 503 ? "The item could not be cancelled. Refresh and try again."
      : error.message || "This order changed. Refresh before cancelling an item." };
  }
  try { refreshOrderPaths(orderId); } catch { /* Cancellation committed; cache refresh is best effort. */ }
  return { success: true, data: undefined, message: "Item cancelled and stock restored." };
}
// Same stock-restoring procedure as the order page's Cancel Order, but returns a
// result instead of redirecting so the Orders panel can stay open.
export async function cancelOrderWorkspaceOrder(orderId: string, updatedAt: string | null, reason: string, expectedBusinessId: string): Promise<ActionResult> {
  const business = await requirePermission("orders.cancel");
  if (business.id !== expectedBusinessId) return { success: false, message: "Your selected business changed. Reload this page." };
  if (!validId(orderId) || typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) return { success: false, message: "Refresh the order before cancelling it." };
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) return { success: false, message: "Enter a cancellation reason (maximum 500 characters)." };
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("id,order_number").eq("id", orderId).eq("business_id", business.id).maybeSingle();
  if (!order) return { success: false, message: "Order not found in this branch." };
  const { error } = await supabase.rpc("tenh_run_branch_stock", { p_business: business.id, p_operation: "cancel_order", p_payload: { p_order_id: orderId, p_reason: reason.trim(), p_expected_updated_at: updatedAt } });
  if (error) return { success: false, message: ["P0001", "PT409", "40001", "42501", "22023"].includes(error.code ?? "") ? error.message : "The order could not be cancelled. Refresh and try again; nothing was changed." };
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
export type BulkDeleteResult = { deleted: string[]; failed: { id: string; message: string }[] };
// Each order goes through the same single-order delete RPC (eligibility, stock and
// version checks) one at a time, so one failure never rolls back or hides another.
export async function deleteOrderWorkspaceOrders(items: { id: string; updatedAt: string | null }[], reason: string, expectedBusinessId: string): Promise<ActionResult<BulkDeleteResult>> {
  const business = await requirePermission("orders.cancel");
  if (business.id !== expectedBusinessId) return { success: false, message: "Your selected business changed. Reload this page." };
  if (!Array.isArray(items) || !items.length || items.length > 50) return { success: false, message: "Select between 1 and 50 orders." };
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) return { success: false, message: "Please enter a deletion reason (maximum 500 characters)." };
  const result: BulkDeleteResult = { deleted: [], failed: [] };
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    try {
      const outcome = await manageOrder(business.id, item.id, item.updatedAt, "delete", { reason: reason.trim() });
      if (outcome.success) result.deleted.push(item.id); else result.failed.push({ id: item.id, message: outcome.message });
    } catch { result.failed.push({ id: item.id, message: "The result could not be confirmed. Refresh before retrying this order." }); }
  }
  return { success: true, data: result };
}
export type BulkStatusResult = { updated: string[]; failed: { id: string; message: string }[] };
// Cancellation is excluded: it needs orders.cancel, a reason and stock restoration.
const bulkStatuses = ["pending", "in_progress", "accepted", "preparing", "completed"];
// Each order walks its normal steps (e.g. Confirmed -> In Progress -> Completed)
// through the same per-order RPC as the single status change, so every step gets
// its own authorization, version and allowed-transition check; failures stay isolated.
export async function changeOrderWorkspaceStatuses(items: { id: string; updatedAt: string | null; steps: string[] }[], expectedBusinessId: string): Promise<ActionResult<BulkStatusResult>> {
  const business = await requirePermission("orders.update");
  if (business.id !== expectedBusinessId) return { success: false, message: "Your selected business changed. Reload this page." };
  if (!Array.isArray(items) || !items.length || items.length > 50) return { success: false, message: "Select between 1 and 50 orders." };
  const result: BulkStatusResult = { updated: [], failed: [] };
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    const steps = Array.isArray(item.steps) ? item.steps : [];
    if (!steps.length || steps.length > 3 || !steps.every((step) => bulkStatuses.includes(step))) { result.failed.push({ id: item.id, message: "This status cannot be applied in bulk." }); continue; }
    if (!item.updatedAt) { result.failed.push({ id: item.id, message: "Refresh the order before changing its status." }); continue; }
    let version: string | null = item.updatedAt;
    let done = 0;
    try {
      for (const step of steps) {
        // Later steps use the version written by this action's previous step.
        if (done) {
          const supabase = await createClient();
          const { data } = await supabase.from("orders").select("updated_at").eq("id", item.id).eq("business_id", business.id).maybeSingle();
          version = data?.updated_at ?? null;
          if (!version) throw new Error("version");
        }
        const outcome = await manageOrder(business.id, item.id, version, "status", { status: step, reason: "" });
        if (!outcome.success) { result.failed.push({ id: item.id, message: done ? `Moved ${done} of ${steps.length} steps, then stopped: ${outcome.message}` : outcome.message }); break; }
        done++;
      }
      if (done === steps.length) result.updated.push(item.id);
    } catch { result.failed.push({ id: item.id, message: `The result could not be confirmed${done ? ` after ${done} of ${steps.length} steps` : ""}. Refresh before retrying this order.` }); }
  }
  return { success: true, data: result };
}
