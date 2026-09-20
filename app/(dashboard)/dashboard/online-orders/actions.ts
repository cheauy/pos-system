"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";

import { createClient } from "@/lib/supabase/branch-server";

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
      "orders.update",
    );
    const scopedDb = await createClient();

    if (!allowedStatuses.includes(nextStatus)) {
      return {
        success: false,
        message: "Invalid online order status.",
      };
    }

    const { data: order, error: loadError } =
      await scopedDb
        .from("orders")
        .select(`
          id,
          order_number,
          status,
          online_status,
          order_source
        `)
        .eq("id", orderId)
        .eq("business_id", business.id)
        .in("order_source", ["online", "qr"])
        .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!order) {
      throw new Error("Online order not found.");
    }

    const { data: updated, error: updateError } = await scopedDb.rpc(
      "tenh_update_online_order_status",
      {
        p_business: business.id,
        p_order: orderId,
        p_status: nextStatus,
        p_expected_status: order.online_status ?? "new",
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

    const { data: order, error: loadError } = await scopedDb
      .from("orders")
      .select(`
        id,
        order_number,
        order_source,
        payment_method,
        payment_status,
        total
      `)
      .eq("id", orderId)
      .eq("business_id", business.id)
      .in("order_source", ["online", "qr"])
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!order) throw new Error("Online order not found.");
    if (order.payment_method !== "khqr") {
      throw new Error("Payment verification is only used for KHQR orders.");
    }

    const paid = nextStatus === "paid";
    const { data: updated, error: updateError } = await scopedDb
      .from("orders")
      .update({
        payment_status: nextStatus,
        amount_paid: paid ? Number(order.total) : 0,
        remaining_balance: paid ? 0 : Number(order.total),
        change_amount: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("business_id", business.id)
      .select("id")
      .maybeSingle();

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
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/online-orders");
    revalidatePath(`/dashboard/orders/${orderId}`);

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
