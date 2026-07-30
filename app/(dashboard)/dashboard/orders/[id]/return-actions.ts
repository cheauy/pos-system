"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

export type CreateReturnState = {
  success: boolean;
  message: string;
  returnId?: string;
};

type ReturnItemInput = {
  order_item_id: string;
  quantity: number;
};

function getReturnId(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  const row = Array.isArray(value)
    ? value[0]
    : value;

  if (
    !row ||
    typeof row !== "object"
  ) {
    return null;
  }

  const record = row as Record<string, unknown>;
  const id =
    record.return_id ?? record.id;

  return typeof id === "string" &&
    id.trim()
    ? id.trim()
    : null;
}

export async function createOrderReturn(
  previousState: CreateReturnState,
  formData: FormData,
): Promise<CreateReturnState> {
  const business = await requirePermission(
    "orders.return",
  );

  const orderIdValue = formData.get("orderId");
  const reasonValue = formData.get("reason");
  const itemsValue = formData.get("items");

  if (
    typeof orderIdValue !== "string" ||
    !orderIdValue.trim()
  ) {
    return {
      success: false,
      message: "Order ID is required.",
    };
  }

  if (
    typeof reasonValue !== "string" ||
    reasonValue.trim().length < 3
  ) {
    return {
      success: false,
      message:
        "Return reason must contain at least 3 characters.",
    };
  }

  if (
    typeof itemsValue !== "string" ||
    !itemsValue.trim()
  ) {
    return {
      success: false,
      message: "Select at least one item to return.",
    };
  }

  let parsedItems: unknown;

  try {
    parsedItems = JSON.parse(itemsValue);
  } catch {
    return {
      success: false,
      message: "Invalid return item data.",
    };
  }

  if (!Array.isArray(parsedItems)) {
    return {
      success: false,
      message: "Invalid return item data.",
    };
  }

  const cleanedItems: ReturnItemInput[] = [];
  const orderItemIds = new Set<string>();

  for (const value of parsedItems) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return {
        success: false,
        message: "Invalid return item data.",
      };
    }

    const item = value as Record<string, unknown>;
    const orderItemId =
      typeof item.order_item_id === "string"
        ? item.order_item_id.trim()
        : "";
    const quantity = Number(item.quantity);

    if (
      !orderItemId ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return {
        success: false,
        message: "Invalid return item data.",
      };
    }

    if (orderItemIds.has(orderItemId)) {
      return {
        success: false,
        message:
          "Each order item can only appear once in a return.",
      };
    }

    orderItemIds.add(orderItemId);
    cleanedItems.push({
      order_item_id: orderItemId,
      quantity,
    });
  }

  if (cleanedItems.length === 0) {
    return {
      success: false,
      message: "Select at least one item to return.",
    };
  }

  const supabase = await createClient();

  const orderId = orderIdValue.trim();

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
    return {
      success: false,
      message:
        orderError?.message ??
        "Order not found.",
    };
  }

  const { data: returnResult, error } =
    await supabase.rpc(
      "create_order_return",
      {
        p_order_id: orderId,
        p_reason: reasonValue.trim(),
        p_items: cleanedItems,
      },
    );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  const returnId =
    getReturnId(returnResult);

  if (!returnId) {
    return {
      success: false,
      message:
        "The return was created, but no return ID was returned.",
    };
  }

  await createAuditLog({
    action: "return",
    entityType: "order",
    entityId: order.id,
    description:
      `Returned products for order ${order.order_number}`,
    metadata: {
      return_id: returnId,
      reason: reasonValue.trim(),
      items: cleanedItems,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath(
    `/dashboard/orders/${orderId}`,
  );
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/returns");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/low-stock");

  return {
    success: true,
    message: "Return created successfully.",
    returnId,
  };
}
