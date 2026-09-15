"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

export type CreateBundleState = {
  success: boolean;
  message: string;
};

type BundleItemInput = {
  productId: string;
  quantity: number;
};

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readMoney(formData: FormData, key: string) {
  const value = Number(readText(formData, key));
  return Number.isFinite(value) ? value : Number.NaN;
}

function parseItems(value: FormDataEntryValue | null): BundleItemInput[] {
  if (typeof value !== "string") return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): BundleItemInput | null => {
        if (!item || typeof item !== "object") return null;

        const productId = "productId" in item ? item.productId : null;
        const quantity = "quantity" in item ? Number(item.quantity) : Number.NaN;

        if (
          typeof productId !== "string" ||
          productId.trim().length === 0 ||
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          return null;
        }

        return { productId: productId.trim(), quantity };
      })
      .filter((item): item is BundleItemInput => item !== null);
  } catch {
    return [];
  }
}

export async function createBundleProduct(
  _previousState: CreateBundleState,
  formData: FormData,
): Promise<CreateBundleState> {
  const business = await requirePermission("products.create");
  const supabase = await createClient();

  if (business.product_mode === "configurable") {
    return {
      success: false,
      message: "Bundles are currently enabled only for Standard and Variant modes.",
    };
  }

  const name = readText(formData, "name");
  const sku = readText(formData, "sku");
  const categoryId = readText(formData, "categoryId") || null;
  const description = readText(formData, "description") || null;
  const sellingPrice = readMoney(formData, "sellingPrice");
  const items = parseItems(formData.get("items"));

  if (name.length < 2) {
    return { success: false, message: "Bundle name must contain at least 2 characters." };
  }

  if (!sku) {
    return { success: false, message: "Please enter a bundle SKU." };
  }

  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    return { success: false, message: "Please enter a valid bundle selling price." };
  }

  if (items.length < 2) {
    return { success: false, message: "A bundle must contain at least 2 products." };
  }

  const uniqueIds = new Set(items.map((item) => item.productId));
  if (uniqueIds.size !== items.length) {
    return { success: false, message: "The same product cannot be added twice." };
  }

  const { data: componentProducts, error: componentError } = await supabase
    .from("products")
    .select("id, name, product_type, cost_price, stock_quantity")
    .eq("business_id", business.id)
    .in("id", [...uniqueIds]);

  if (componentError) {
    return { success: false, message: componentError.message };
  }

  if ((componentProducts ?? []).length !== items.length) {
    return { success: false, message: "One or more selected products are invalid." };
  }

  if ((componentProducts ?? []).some((product) => product.product_type === "bundle")) {
    return { success: false, message: "A bundle cannot contain another bundle." };
  }

  const componentMap = new Map(
    (componentProducts ?? []).map((product) => [product.id, product]),
  );

  const bundleCost = items.reduce((total, item) => {
    const product = componentMap.get(item.productId);
    return total + Number(product?.cost_price ?? 0) * item.quantity;
  }, 0);

  const availableStock = Math.min(
    ...items.map((item) => {
      const product = componentMap.get(item.productId);
      return Math.floor(Number(product?.stock_quantity ?? 0) / item.quantity);
    }),
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Your login session has expired." };
  }

  const { data: existingSku, error: skuError } = await supabase
    .from("products")
    .select("id")
    .eq("business_id", business.id)
    .eq("sku", sku)
    .maybeSingle();

  if (skuError) return { success: false, message: skuError.message };
  if (existingSku) return { success: false, message: "This SKU is already in use." };

  const { data: bundle, error: bundleError } = await supabase
    .from("products")
    .insert({
      owner_id: user.id,
      business_id: business.id,
      category_id: categoryId,
      name,
      sku,
      description,
      product_type: "bundle",
      cost_price: bundleCost,
      selling_price: sellingPrice,
      stock_quantity: availableStock,
      low_stock_quantity: 1,
      is_active: true,
    })
    .select("id, name")
    .single();

  if (bundleError || !bundle) {
    return { success: false, message: bundleError?.message ?? "Unable to create bundle." };
  }

  const { error: itemError } = await supabase.from("bundle_items").insert(
    items.map((item) => ({
      business_id: business.id,
      bundle_product_id: bundle.id,
      component_product_id: item.productId,
      quantity: item.quantity,
    })),
  );

  if (itemError) {
    await supabase.from("products").delete().eq("id", bundle.id).eq("business_id", business.id);
    return { success: false, message: itemError.message };
  }

  await createAuditLog({
    action: "create",
    entityType: "product",
    entityId: bundle.id,
    description: `Created bundle ${bundle.name}`,
    metadata: {
      product_type: "bundle",
      selling_price: sellingPrice,
      available_stock: availableStock,
      components: items,
    },
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");

  return { success: true, message: "Bundle created successfully." };
}
