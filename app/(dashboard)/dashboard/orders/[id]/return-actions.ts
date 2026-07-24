"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function createOrderReturn(
  previousState: CreateReturnState,
  formData: FormData,
): Promise<CreateReturnState> {
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

  let items: ReturnItemInput[];

  try {
    items = JSON.parse(itemsValue) as ReturnItemInput[];
  } catch {
    return {
      success: false,
      message: "Invalid return item data.",
    };
  }

  const cleanedItems = items
    .map((item) => ({
      order_item_id: String(
        item.order_item_id,
      ),
      quantity: Number(item.quantity),
    }))
    .filter(
      (item) =>
        item.order_item_id &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0,
    );

  if (cleanedItems.length === 0) {
    return {
      success: false,
      message: "Select at least one item to return.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const orderId = orderIdValue.trim();

  const { data: returnId, error } =
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