"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";

import { createClient } from "@/lib/supabase/branch-server";
import { getIncomingOrders } from "@/lib/branches/incoming-orders";

const allowedStatuses = [
  "accepted",
  "preparing",
  "ready",
  "completed",
  "rejected",
] as const;

type OnlineOrderStatus =
  (typeof allowedStatuses)[number];

export type UpdateOnlineOrderResult = {
  success: boolean;
  message: string;
};

export async function updateOnlineOrderStatus(
  orderId: string,
  nextStatus: OnlineOrderStatus,
): Promise<UpdateOnlineOrderResult> {
  try {
    const business = await requirePermission(
      nextStatus === "rejected" ? "orders.cancel" : "orders.update",
    );
    const scopedDb = await createClient();

    if (!allowedStatuses.includes(nextStatus)) {
      return {
        success: false,
        message: "Invalid online order status.",
      };
    }

    const order = (await getIncomingOrders(business.id)).orders.find(item => item.id === orderId);

    if (!order) {
      throw new Error("Online order not found.");
    }

    const { data: updated, error: updateError } = await scopedDb.rpc(
      "tenh_incoming_order_action",
      {
        p_business: business.id,
        p_order: orderId,
        p_status: nextStatus,
        p_expected: order.online_status ?? "new",
        p_action: "status",
      },
    );
    if (updateError) {
      throw new Error(updateError.code === "PGRST202" || updateError.code === "42883"
        ? "Apply 20260921110000_operating_branch_completion.sql before updating online orders."
        : updateError.message);
    }
    if (!updated || updated.orderId !== orderId || updated.onlineStatus !== nextStatus) {
      throw new Error("The status result could not be confirmed. Refresh this order before retrying the same status.");
    }

    if (!updated.alreadyApplied) await createAuditLog({
      action: "update",
      entityType: "order",
      entityId: orderId,
      description: `Changed online order ${order.order_number} to ${nextStatus}`,
      metadata: {
        previous_online_status: order.online_status,
        new_online_status: nextStatus,
        order_source: order.order_source,
      },
    }).catch(() => console.error("Order status committed; audit refresh failed."));

    try {
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/orders");
      revalidatePath("/dashboard/online-orders");
      revalidatePath(`/dashboard/orders/${orderId}`);
      revalidatePath("/dashboard/products");
    } catch { console.error("Order status committed; cache refresh failed."); }

    return {
      success: true,
      message: `Order ${order.order_number} marked ${nextStatus}.`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to update online order.",
    };
  }
}

const allowedPaymentStatuses = [
  "pending_verification",
  "paid",
  "unpaid",
] as const;

type OnlinePaymentStatus =
  (typeof allowedPaymentStatuses)[number];

export async function updateOnlinePaymentStatus(
  orderId: string,
  nextStatus: OnlinePaymentStatus,
): Promise<UpdateOnlineOrderResult> {
  try {
    const business = await requirePermission("orders.update");
    const scopedDb = await createClient();

    if (!allowedPaymentStatuses.includes(nextStatus)) {
      return {
        success: false,
        message: "Invalid payment status.",
      };
    }

    const order = (await getIncomingOrders(business.id)).orders.find(item => item.id === orderId);
    if (!order) throw new Error("Online order not found.");
    if (order.payment_method !== "khqr") {
      throw new Error("Payment verification is only used for KHQR orders.");
    }

    const { data: updated, error: updateError } = await scopedDb.rpc("tenh_incoming_order_action", {
      p_business: business.id, p_order: orderId, p_action: "payment", p_status: nextStatus, p_expected: order.payment_status,
    });

    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error("Unable to update payment status.");

    await createAuditLog({
      action: "update",
      entityType: "order",
      entityId: orderId,
      description: `Changed online order ${order.order_number} payment to ${nextStatus}`,
      metadata: {
        previous_payment_status: order.payment_status,
        new_payment_status: nextStatus,
        payment_method: order.payment_method,
      },
    }).catch(() => console.error("Payment committed; audit refresh failed."));

    try {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/online-orders");
    revalidatePath(`/dashboard/orders/${orderId}`);
    } catch { /* Payment committed; refresh errors must not imply failure. */ }

    return {
      success: true,
      message: `Payment for ${order.order_number} marked ${nextStatus.replaceAll("_", " ")}.`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to update payment status.",
    };
  }
}

export async function setIncomingOrderScope(receiveAll: boolean) {
  try {
    const business = await requirePermission("orders.view");
    if (typeof receiveAll !== "boolean") throw new Error("Choose an order scope.");
    const db = await createClient();
    const { error } = await db.rpc("tenh_set_online_order_scope", { p_business: business.id, p_all: receiveAll });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard", "layout");
    return { success: true, message: receiveAll ? "Receiving online orders from all branches." : "Receiving orders for this branch." };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "Unable to save order scope." }; }
}

export async function incomingOrderSummary() {
  const business = await requirePermission("orders.view");
  const data = await getIncomingOrders(business.id);
  return data.orders.filter(order => (order.online_status ?? "new") === "new").map(order => ({ id: order.id, createdAt: order.created_at }));
}
