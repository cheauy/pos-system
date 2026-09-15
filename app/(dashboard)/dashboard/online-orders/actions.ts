"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

    if (!allowedStatuses.includes(nextStatus)) {
      return {
        success: false,
        message: "Invalid online order status.",
      };
    }

    const { data: order, error: loadError } =
      await supabaseAdmin
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

    if (["completed", "rejected"].includes(order.online_status ?? "")) {
      throw new Error(
        "Completed or rejected online orders cannot be changed.",
      );
    }

    if (nextStatus === "rejected") {
      // Use the existing cancellation RPC so stock/inventory is restored
      // exactly the same way as a cancelled POS order.
      const supabase = await createClient();
      const { error: cancelError } = await supabase.rpc(
        "cancel_order",
        {
          p_order_id: orderId,
          p_reason: "Online order rejected by shop",
        },
      );

      if (cancelError) {
        throw new Error(cancelError.message);
      }
    }

    const orderStatus =
      nextStatus === "completed"
        ? "completed"
        : nextStatus === "rejected"
          ? "cancelled"
          : "pending";

    let updateQuery = supabaseAdmin
      .from("orders")
      .update({
        online_status: nextStatus,
        ...(nextStatus === "rejected"
          ? {}
          : { status: orderStatus }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("business_id", business.id);

    if (nextStatus !== "rejected") {
      updateQuery = updateQuery.eq(
        "online_status",
        order.online_status,
      );
    }

    const { data: updated, error: updateError } =
      await updateQuery
        .select("id, order_number, online_status")
        .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!updated) {
      throw new Error(
        "This order changed while you were updating it. Refresh and try again.",
      );
    }

    await createAuditLog({
      action: "update",
      entityType: "order",
      entityId: orderId,
      description: `Changed online order ${order.order_number} to ${nextStatus}`,
      metadata: {
        previous_online_status: order.online_status,
        new_online_status: nextStatus,
        order_source: order.order_source,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/online-orders");
    revalidatePath(`/dashboard/orders/${orderId}`);
    revalidatePath("/dashboard/products");

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

    if (!allowedPaymentStatuses.includes(nextStatus)) {
      return {
        success: false,
        message: "Invalid payment status.",
      };
    }

    const { data: order, error: loadError } = await supabaseAdmin
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
    const { data: updated, error: updateError } = await supabaseAdmin
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
