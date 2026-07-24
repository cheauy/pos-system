"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type PurchaseItemInput = {
  product_id: string;
  quantity: number;
  unit_cost: number;
};

function getOptionalText(
  formData: FormData,
  fieldName: string,
) {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

export async function createPurchase(
  formData: FormData,
) {
  const supplierValue =
    formData.get("supplierId");

  const supplierId =
    typeof supplierValue === "string" &&
    supplierValue.trim()
      ? supplierValue.trim()
      : null;

  const referenceNumber = getOptionalText(
    formData,
    "referenceNumber",
  );

  const notes = getOptionalText(
    formData,
    "notes",
  );

  const purchaseDateValue =
    formData.get("purchaseDate");

  const purchaseDate =
    typeof purchaseDateValue === "string" &&
    purchaseDateValue
      ? purchaseDateValue
      : new Date().toISOString().slice(0, 10);

  const itemsValue = formData.get("items");

  if (
    typeof itemsValue !== "string" ||
    !itemsValue
  ) {
    throw new Error(
      "Purchase items are required.",
    );
  }

  let items: PurchaseItemInput[];

  try {
    items = JSON.parse(
      itemsValue,
    ) as PurchaseItemInput[];
  } catch {
    throw new Error(
      "Invalid purchase items.",
    );
  }

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw new Error(
      "Add at least one product.",
    );
  }

  const cleanedItems = items.map((item) => ({
    product_id: String(item.product_id),
    quantity: Number(item.quantity),
    unit_cost: Number(item.unit_cost),
  }));

  for (const item of cleanedItems) {
    if (!item.product_id) {
      throw new Error(
        "Every item must have a product.",
      );
    }

    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new Error(
        "Every quantity must be greater than zero.",
      );
    }

    if (
      !Number.isFinite(item.unit_cost) ||
      item.unit_cost < 0
    ) {
      throw new Error(
        "Every unit cost must be valid.",
      );
    }
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: purchaseId, error } =
    await supabase.rpc(
      "create_received_purchase",
      {
        p_supplier_id: supplierId,
        p_reference_number:
          referenceNumber,
        p_purchase_date: purchaseDate,
        p_notes: notes,
        p_items: cleanedItems,
      },
    );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/reports");

  redirect(
    `/dashboard/purchases/${purchaseId}`,
  );

}

export type CancelPurchaseState = {
  success: boolean;
  message: string;
};

export async function cancelPurchase(
  previousState: CancelPurchaseState,
  formData: FormData,
): Promise<CancelPurchaseState> {
  const purchaseIdValue =
    formData.get("purchaseId");

  const reasonValue =
    formData.get("reason");

  if (
    typeof purchaseIdValue !== "string" ||
    !purchaseIdValue.trim()
  ) {
    return {
      success: false,
      message: "Purchase ID is required.",
    };
  }

  if (
    typeof reasonValue !== "string" ||
    !reasonValue.trim()
  ) {
    return {
      success: false,
      message:
        "Cancellation reason is required.",
    };
  }

  const purchaseId =
    purchaseIdValue.trim();

  const reason =
    reasonValue.trim();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc(
    "cancel_purchase",
    {
      p_purchase_id: purchaseId,
      p_reason: reason,
    },
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/purchases");
  revalidatePath(
    `/dashboard/purchases/${purchaseId}`,
  );
  revalidatePath("/dashboard/reports");

  return {
    success: true,
    message:
      "Purchase cancelled successfully.",
  };
}