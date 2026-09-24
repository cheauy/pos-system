"use server";

import {
  revalidatePath,
} from "next/cache";
import { redirect } from "next/navigation";

import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

type RawPurchaseItem = {
  productId: string;
  productName?: string;
  quantity: number | string;
  unitCost: number | string;
};

type ValidatedPurchaseItem = {
  productId: string;
  quantity: number;
  unitCost: number;
};

function getOptionalText(
  formData: FormData,
  name: string,
): string | null {
  const value = formData.get(name);

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0
    ? trimmedValue
    : null;
}

function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");
  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);
  const parsedDate = new Date(
    Date.UTC(year, month - 1, day),
  );

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}

function getPurchaseId(value: unknown): string | null {
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
    record.purchase_id ?? record.id;

  return typeof id === "string" &&
    id.trim()
    ? id.trim()
    : null;
}

function parsePurchaseItems(
  value: FormDataEntryValue | null,
): RawPurchaseItem[] {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      "Add at least one purchased product.",
    );
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(value);
  } catch {
    throw new Error(
      "Invalid purchased-product data.",
    );
  }

  if (!Array.isArray(parsedValue)) {
    throw new Error(
      "Invalid purchased-product data.",
    );
  }

  if (
    parsedValue.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item),
    )
  ) {
    throw new Error(
      "Invalid purchased-product data.",
    );
  }

  return parsedValue as RawPurchaseItem[];
}

export async function createPurchase(
  formData: FormData,
): Promise<void> {
  const business =
    await requirePermission(
      "purchases.create",
    );

  const supabase =
    await createClient();

  const supplierId = getOptionalText(
    formData,
    "supplierId",
  );

  const referenceNumber =
    getOptionalText(
      formData,
      "referenceNumber",
    );

  const notes = getOptionalText(
    formData,
    "notes",
  );

  const purchaseDate =
    getOptionalText(
      formData,
      "purchaseDate",
    ) ??
    getLocalDateString(new Date());

  if (!isValidDateString(purchaseDate)) {
    throw new Error(
      "Purchase date must be a valid calendar date.",
    );
  }

  /*
   * Load and validate the selected supplier.
   */
  if (supplierId) {
    const {
      data: supplier,
      error: supplierError,
    } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .eq(
        "business_id",
        business.id,
      )
      .maybeSingle();

    if (supplierError) {
      throw new Error(
        `Unable to load supplier: ${supplierError.message}`,
      );
    }

    if (!supplier) {
      throw new Error(
        "The selected supplier was not found.",
      );
    }

  }

  /*
   * Read products submitted by the client form.
   */
  const rawItems =
    parsePurchaseItems(
      formData.get("items"),
    );

  if (rawItems.length === 0) {
    throw new Error(
      "Add at least one purchased product.",
    );
  }

  /*
   * Prevent duplicate product rows.
   */
  const submittedProductIds = rawItems.map(
    (item) =>
      String(item.productId ?? "").trim(),
  );

  if (submittedProductIds.some((id) => !id)) {
    throw new Error(
      "No valid products were selected.",
    );
  }

  const productIds = [
    ...new Set(submittedProductIds),
  ];

  if (productIds.length !== submittedProductIds.length) {
    throw new Error(
      "Each product can only appear once in a purchase.",
    );
  }

  /*
   * Load product names from the database.
   * Do not trust product names submitted by the browser.
   */
  const {
    data: products,
    error: productsError,
  } = await supabase
    .from("branch_products")
    .select(
      "id, name, stock_quantity",
    )
    .eq(
      "business_id",
      business.id,
    )
    .in("id", productIds);

  if (productsError) {
    throw new Error(
      `Unable to load products: ${productsError.message}`,
    );
  }

  const productMap = new Map(
    (products ?? []).map(
      (product) => [
        product.id,
        product,
      ],
    ),
  );

  const validatedItems: ValidatedPurchaseItem[] =
    rawItems.map((item) => {
      const productId = String(
        item.productId ?? "",
      ).trim();

      const product =
        productMap.get(productId);

      if (!product) {
        throw new Error(
          "One of the selected products was not found in this business.",
        );
      }

      const quantity = Number(
        item.quantity,
      );

      const unitCost = Number(
        item.unitCost,
      );

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          `Quantity for "${product.name}" must be a whole number greater than zero.`,
        );
      }

      if (
        !Number.isFinite(unitCost) ||
        unitCost < 0
      ) {
        throw new Error(
          `Unit cost for "${product.name}" must be zero or greater.`,
        );
      }

      return {
        productId,
        quantity,
        unitCost,
      };
    });

  const purchaseItems = validatedItems.map(
    (item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      unit_cost: item.unitCost,
    }),
  );

  const {
    data: purchaseResult,
    error: purchaseError,
  } = await supabase.rpc(
    "tenh_run_branch_stock",
    {p_business: business.id, p_operation: "create_purchase", p_payload: {
      p_supplier_id: supplierId,
      p_reference_number:
        referenceNumber,
      p_purchase_date: purchaseDate,
      p_notes: notes,
      p_items: purchaseItems,
    }},
  );

  if (purchaseError) {
    throw new Error(purchaseError.message);
  }

  const purchaseId =
    getPurchaseId(purchaseResult);

  if (!purchaseId) {
    throw new Error(
      "The purchase was created, but no purchase ID was returned.",
    );
  }

  revalidatePath(
    "/dashboard",
  );

  revalidatePath(
    "/dashboard/purchases",
  );

  revalidatePath(
    `/dashboard/purchases/${purchaseId}`,
  );

  revalidatePath(
    "/dashboard/products",
  );

  revalidatePath(
    "/dashboard/inventory",
  );

  revalidatePath(
    "/dashboard/pos",
  );

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
  const business =
    await requirePermission(
      "purchases.cancel",
    );

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

  const supabase =
    await createClient();

  const {
    data: purchase,
    error: purchaseError,
  } = await supabase
    .from("purchases")
    .select("id")
    .eq("id", purchaseId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (purchaseError || !purchase) {
    return {
      success: false,
      message:
        purchaseError?.message ??
        "Purchase not found.",
    };
  }

  const { error } =
    await supabase.rpc(
      "tenh_run_branch_stock",
      {p_business: business.id, p_operation: "cancel_purchase", p_payload: {
        p_purchase_id:
          purchaseId,
        p_reason:
          reason,
      }},
    );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(
    "/dashboard/products",
  );
  revalidatePath(
    "/dashboard/inventory",
  );
  revalidatePath(
    "/dashboard/purchases",
  );
  revalidatePath(
    `/dashboard/purchases/${purchaseId}`,
  );
  revalidatePath(
    "/dashboard/reports",
  );

  return {
    success: true,
    message:
      "Purchase cancelled successfully.",
  };
}
