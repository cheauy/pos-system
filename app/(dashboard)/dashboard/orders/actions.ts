"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

function getRequiredString(
  formData: FormData,
  fieldName: string,
) {
  const value = formData.get(fieldName);

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

export async function cancelOrder(
  formData: FormData,
) {
  const business = await requirePermission(
    "orders.cancel",
  );

  const orderId = getRequiredString(
    formData,
    "orderId",
  );

  const reasonValue =
    formData.get("reason");

  const reason =
    typeof reasonValue === "string"
      ? reasonValue.trim()
      : "";

  const supabase = await createClient();

  const {
    data: order,
    error: orderError,
  } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error(
      orderError?.message ??
        "Order not found.",
    );
  }

  const { error } = await supabase.rpc(
    "cancel_order",
    {
      p_order_id: orderId,
      p_reason: reason || null,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "cancel",
    entityType: "order",
    entityId: order.id,
    description: `Cancelled order ${order.order_number}`,
    metadata: {
      reason: reason || null,
    },
  });


  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath(
    `/dashboard/orders/${orderId}`,
  );
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/reports");

  redirect(
    `/dashboard/orders/${orderId}?cancelled=true`,
  );
}

const allowedOrderStatuses = [
  "new",
  "pending",
  "completed",
] as const;

type OrderStatus =
  (typeof allowedOrderStatuses)[number];

export async function updateOrderStatus(
  formData: FormData,
) {
  const business = await requirePermission(
    "orders.update",
  );

  const orderId = getRequiredString(
    formData,
    "orderId",
  );

  const status = getRequiredString(
    formData,
    "status",
  ).toLowerCase();

  if (
    !allowedOrderStatuses.includes(
      status as OrderStatus,
    )
  ) {
    throw new Error("Invalid order status.");
  }

  const supabase = await createClient();

  const {
    data: existingOrder,
    error: existingOrderError,
  } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (existingOrderError || !existingOrder) {
    throw new Error(
      existingOrderError?.message ??
        "Order not found.",
    );
  }

  if (
    existingOrder.status === "cancelled" ||
    existingOrder.status === "refunded"
  ) {
    throw new Error(
      "Cancelled or refunded orders cannot be changed.",
    );
  }

  const {
    data: updatedOrder,
    error: updateError,
  } = await supabase
    .from("orders")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", business.id)
    .eq("status", existingOrder.status)
    .select("id, order_number, status")
    .maybeSingle();

  if (updateError) {
    throw new Error(
      updateError.message,
    );
  }

  if (!updatedOrder) {
    throw new Error(
      "The order changed while you were updating it. Refresh and try again.",
    );
  }

  await createAuditLog({
    action: "update",
    entityType: "order",
    entityId: updatedOrder.id,
    description: `Changed order ${updatedOrder.order_number} status from ${existingOrder.status} to ${updatedOrder.status}`,
    metadata: {
      previous_status: existingOrder.status,
      new_status: updatedOrder.status,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath(
    `/dashboard/orders/${orderId}`,
  );
  revalidatePath("/dashboard/reports");
}
