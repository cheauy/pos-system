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
