"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
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
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
    entityType: "product",
    entityId: user.id,
    description: `Cancelled order ${orderId}`,
    metadata: {
    reason: reason || null,
  }
  
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
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: existingOrder,
    error: existingOrderError,
  } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("id", orderId)
    .eq("owner_id", user.id)
    .single();

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
    .eq("owner_id", user.id)
    .select("id, order_number, status")
    .single();

  if (updateError || !updatedOrder) {
    throw new Error(
      updateError?.message ??
        "Unable to update order status.",
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