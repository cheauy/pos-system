"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

import {
  initialStockAdjustmentState,
  type StockAdjustmentActionState,
} from "./state";

function textField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function submitStockAdjustment(
  _previousState: StockAdjustmentActionState,
  formData: FormData,
): Promise<StockAdjustmentActionState> {
  try {
    const business = await requirePermission("products.stock_adjust");

    const productId = textField(formData, "productId");
    const mode = textField(formData, "mode");
    const reason = textField(formData, "reason");
    const reference = textField(formData, "reference") || null;
    const notes = textField(formData, "notes");
    const quantityValue = textField(formData, "quantity");
    const quantity = Number(quantityValue);

    if (!productId) {
      return {
        success: false,
        message: "Select a product or variant.",
        submittedAt: Date.now(),
      };
    }

    if (!(["increase", "decrease", "set"] as const).includes(mode as "increase" | "decrease" | "set")) {
      return {
        success: false,
        message: "Select a valid adjustment type.",
        submittedAt: Date.now(),
      };
    }

    const quantityIsValid =
      Number.isInteger(quantity) &&
      (mode === "set" ? quantity >= 0 : quantity > 0);

    if (!quantityIsValid) {
      return {
        success: false,
        message:
          mode === "set"
            ? "Exact stock must be zero or a positive whole number."
            : "Quantity must be a positive whole number.",
        submittedAt: Date.now(),
      };
    }

    if (reason.length < 2) {
      return {
        success: false,
        message: "Select a reason for this adjustment.",
        submittedAt: Date.now(),
      };
    }

    if (notes.length > 500) {
      return {
        success: false,
        message: "Notes must be 500 characters or fewer.",
        submittedAt: Date.now(),
      };
    }

    const supabase = await createClient();

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, stock_quantity")
      .eq("id", productId)
      .eq("business_id", business.id)
      .eq("is_active", true)
      .maybeSingle();

    if (productError) {
      return {
        success: false,
        message: productError.message,
        submittedAt: Date.now(),
      };
    }

    if (!product) {
      return {
        success: false,
        message: "This product is no longer available in this business.",
        submittedAt: Date.now(),
      };
    }

    const currentStock = Number(product.stock_quantity ?? 0);
    if (mode === "decrease" && quantity > currentStock) {
      return {
        success: false,
        message: `Cannot decrease ${quantity}. Only ${currentStock} unit${currentStock === 1 ? " is" : "s are"} currently in stock.`,
        submittedAt: Date.now(),
      };
    }

    const auditReason = notes ? `${reason} — ${notes}` : reason;

    const { error } = await supabase.rpc("adjust_product_stock", {
      p_product_id: productId,
      p_mode: mode,
      p_quantity: quantity,
      p_reason: auditReason,
      p_reference: reference,
    });

    if (error) {
      return {
        success: false,
        message: error.message,
        submittedAt: Date.now(),
      };
    }

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/adjustments");
    revalidatePath("/dashboard/low-stock");
    revalidatePath("/dashboard/products");

    return {
      success: true,
      message: `Stock adjustment saved for ${product.name}.`,
      submittedAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save stock adjustment.",
      submittedAt: Date.now(),
    };
  }
}

// Keep the original export available for any existing callers.
export async function adjustStock(formData: FormData) {
  const result = await submitStockAdjustment(initialStockAdjustmentState, formData);
  if (!result.success) {
    throw new Error(result.message);
  }
}
