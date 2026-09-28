"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

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
    "tenh_run_branch_stock",
    {p_business: business.id, p_operation: "cancel_order", p_payload: {
      p_order_id: orderId,
      p_reason: reason || null,
    }},
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
