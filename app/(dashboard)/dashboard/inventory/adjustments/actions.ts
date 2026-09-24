"use server";

import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { assertOperatingBranch } from "@/lib/branches/context";

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
  let requestSent = false;
  try {
    const business = await requirePermission("products.stock_adjust");

    const locationId = textField(formData, "locationId");
    await assertOperatingBranch(locationId);
    await assertBranchOperation(business.id, locationId);
    const productId = textField(formData, "productId");
    const mode = textField(formData, "mode");
    const reason = textField(formData, "reason");
    const reference = textField(formData, "reference") || null;
    const notes = textField(formData, "notes");
    const quantityValue = textField(formData, "quantity");
    const quantity = Number(quantityValue);
    const requestId = textField(formData, "requestId");
    const expectedValue = textField(formData, "expectedQuantity");
    const expectedQuantity = Number(expectedValue);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
      || !expectedValue || !Number.isSafeInteger(expectedQuantity) || expectedQuantity < 0) {
      return { success: false, message: "Reload the adjustment form before saving.", submittedAt: Date.now() };
    }

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
      quantityValue.length > 0 && Number.isSafeInteger(quantity) && quantity <= 2147483647 &&
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

    if (notes.length > 500 || (reference?.length ?? 0) > 200 || reason.length > 100) {
      return {
        success: false,
        message: "Notes must be 500 characters or fewer.",
        submittedAt: Date.now(),
      };
    }

    const supabase = await createClient();

    const { data: product, error: productError } = await supabase
      .from("branch_products")
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

    const auditReason = notes ? `${reason} — ${notes}` : reason;

    requestSent = true;
    const { error } = await supabase.rpc("tenh_adjust_branch_stock", {
      p_business_id: business.id,
      p_location_id: locationId,
      p_product_id: productId,
      p_mode: mode,
      p_quantity: quantity,
      p_reason: auditReason,
      p_reference: reference,
      p_request_id: requestId,
      p_expected_quantity: expectedQuantity,
    });
    if (error) {
      return {
        success: false,
        message: error.code === "PGRST202" ? "Stock adjustment update is not installed yet." : error.message,
        uncertain: !error.code || !/^(22|23|42|P0001|PGRST202)/.test(error.code),
        submittedAt: Date.now(),
      };
    }

    try {
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/adjustments");
    revalidatePath("/dashboard/low-stock");
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/pos");
    } catch { /* The transaction committed. A refresh failure must not report a failed save. */ }

    return {
      success: true,
      message: `Stock adjustment saved for ${product.name}.`,
      submittedAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      uncertain: requestSent,
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
