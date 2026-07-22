"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function getOptionalText(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim();

  return cleanValue.length > 0 ? cleanValue : null;
}

function getNumber(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${key} must be a valid number.`);
  }

  return parsedValue;
}

export async function createProduct(formData: FormData) {
  const name = formData.get("name");

  if (typeof name !== "string" || name.trim().length < 2) {
    throw new Error("Product name must contain at least 2 characters.");
  }

  const categoryId = getOptionalText(formData, "categoryId");
  const sku = getOptionalText(formData, "sku");
  const barcode = getOptionalText(formData, "barcode");
  const description = getOptionalText(formData, "description");

  const costPrice = getNumber(formData, "costPrice");
  const sellingPrice = getNumber(formData, "sellingPrice");
  const stockQuantity = getNumber(formData, "stockQuantity");
  const lowStockQuantity = getNumber(formData, "lowStockQuantity");

  if (costPrice < 0 || sellingPrice < 0) {
    throw new Error("Prices cannot be negative.");
  }

  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    throw new Error("Stock quantity must be a positive whole number.");
  }

  if (!Number.isInteger(lowStockQuantity) || lowStockQuantity < 0) {
    throw new Error("Low-stock quantity must be a positive whole number.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("products").insert({
    owner_id: user.id,
    category_id: categoryId,
    name: name.trim(),
    sku,
    barcode,
    description,
    cost_price: costPrice,
    selling_price: sellingPrice,
    stock_quantity: stockQuantity,
    low_stock_quantity: lowStockQuantity,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "The SKU or barcode already belongs to another product.",
      );
    }

    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
}

export async function deleteProduct(formData: FormData) {
  const productId = formData.get("productId");

  if (typeof productId !== "string" || !productId) {
    throw new Error("Invalid product ID.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
}