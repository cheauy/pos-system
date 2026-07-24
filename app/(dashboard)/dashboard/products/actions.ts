"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
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

const PRODUCT_IMAGE_BUCKET = "product-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function getImageFile(formData: FormData): File | null {
  const value = formData.get("image");

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(value.type)) {
    throw new Error(
      "Only JPG, PNG or WebP images are allowed.",
    );
  }

  if (value.size > MAX_IMAGE_SIZE) {
    throw new Error(
      "Product image must not exceed 5 MB.",
    );
  }

  return value;
}

function getImageExtension(file: File) {
  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function getStoragePathFromUrl(imageUrl: string) {
  const marker = `/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  const path = imageUrl.split(marker)[1];

  return path ? decodeURIComponent(path) : null;
}

export async function createProduct(formData: FormData) {
  const name = formData.get("name");

  if (
    typeof name !== "string" ||
    name.trim().length < 2
  ) {
    throw new Error(
      "Product name must contain at least 2 characters.",
    );
  }

  const categoryId = getOptionalText(
    formData,
    "categoryId",
  );

  const sku = getOptionalText(formData, "sku");

  const description = getOptionalText(
    formData,
    "description",
  );

  const costPrice = getNumber(
    formData,
    "costPrice",
  );

  const sellingPrice = getNumber(
    formData,
    "sellingPrice",
  );

  const stockQuantity = getNumber(
    formData,
    "stockQuantity",
  );

  const lowStockValue = formData.get(
    "lowStockQuantity",
  );

  const lowStockQuantity =
    typeof lowStockValue === "string"
      ? Number(lowStockValue)
      : 5;

  if (costPrice < 0 || sellingPrice < 0) {
    throw new Error("Prices cannot be negative.");
  }

  if (
    !Number.isInteger(stockQuantity) ||
    stockQuantity < 0
  ) {
    throw new Error(
      "Stock quantity must be a positive whole number.",
    );
  }

  if (
    !Number.isInteger(lowStockQuantity) ||
    lowStockQuantity < 0
  ) {
    throw new Error(
      "Low-stock quantity must be zero or greater.",
    );
  }

  const imageFile = getImageFile(formData);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let imageUrl: string | null = null;
  let uploadedImagePath: string | null = null;

  if (imageFile) {
    const extension = getImageExtension(imageFile);

    uploadedImagePath =
      `${user.id}/${crypto.randomUUID()}.${extension}`;

 const { error: uploadError } = await supabase.storage
  .from(PRODUCT_IMAGE_BUCKET)
  .upload(uploadedImagePath, imageFile, {
    contentType: imageFile.type,
    cacheControl: "3600",
    upsert: false,
  });

if (uploadError) {
  throw new Error(
    `Unable to upload product image: ${uploadError.message}`,
  );
}

    const { data: publicUrlData } =
      supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .getPublicUrl(uploadedImagePath);

    imageUrl = publicUrlData.publicUrl;
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      owner_id: user.id,
      category_id: categoryId,
      name: name.trim(),
      sku,
      image_url: imageUrl,
      description,
      cost_price: costPrice,
      selling_price: sellingPrice,
      stock_quantity: stockQuantity,
      low_stock_quantity: lowStockQuantity,
      is_active: true,
    })
    .select("id, name")
    .single();

  if (error) {
    if (uploadedImagePath) {
      await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .remove([uploadedImagePath]);
    }

    if (error.code === "23505") {
      throw new Error(
        "The SKU already belongs to another product.",
      );
    }

    throw new Error(error.message);
  }

  await createAuditLog({
    action: "create",
    entityType: "product",
    entityId: product.id,
    description: `Created product ${product.name}`,
    metadata: {
      sku,
      image_url: imageUrl,
      selling_price: sellingPrice,
      stock_quantity: stockQuantity,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/audit-logs");
}

export async function toggleProductStatus(
  formData: FormData,
) {
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

  const { data: product, error: productError } =
    await supabase
      .from("products")
      .select("id, name, is_active")
      .eq("id", productId)
      .eq("owner_id", user.id)
      .single();

  if (productError || !product) {
    throw new Error(productError?.message);
  }

  const newStatus = !product.is_active;

  const { error } = await supabase
    .from("products")
    .update({
      is_active: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }


  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/audit-logs");
}
export async function updateProduct(formData: FormData) {
  const productId = formData.get("productId");
  const name = formData.get("name");

  if (
    typeof productId !== "string" ||
    productId.length === 0
  ) {
    throw new Error("Invalid product ID.");
  }

  if (
    typeof name !== "string" ||
    name.trim().length < 2
  ) {
    throw new Error(
      "Product name must contain at least 2 characters.",
    );
  }

  const categoryId = getOptionalText(
    formData,
    "categoryId",
  );

  const sku = getOptionalText(formData, "sku");

  const description = getOptionalText(
    formData,
    "description",
  );

  const costPrice = getNumber(
    formData,
    "costPrice",
  );

  const sellingPrice = getNumber(
    formData,
    "sellingPrice",
  );

  const lowStockValue = formData.get(
    "lowStockQuantity",
  );

  const lowStockQuantity =
    typeof lowStockValue === "string"
      ? Number(lowStockValue)
      : 5;

  if (costPrice < 0 || sellingPrice < 0) {
    throw new Error("Prices cannot be negative.");
  }

  if (
    !Number.isInteger(lowStockQuantity) ||
    lowStockQuantity < 0
  ) {
    throw new Error(
      "Low-stock quantity must be zero or greater.",
    );
  }

  const imageFile = getImageFile(formData);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: existingProduct,
    error: existingProductError,
  } = await supabase
    .from("products")
    .select("id, name, image_url")
    .eq("id", productId)
    .eq("owner_id", user.id)
    .single();

  if (existingProductError || !existingProduct) {
    throw new Error(
      existingProductError?.message ??
        "Product was not found.",
    );
  }

  let newImageUrl = existingProduct.image_url;
  let newImagePath: string | null = null;

  if (imageFile) {
    const extension = getImageExtension(imageFile);

    newImagePath =
      `${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } =
      await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .upload(newImagePath, imageFile, {
          contentType: imageFile.type,
          cacheControl: "3600",
          upsert: false,
        });

    if (uploadError) {
      throw new Error(
        `Unable to upload product image: ${uploadError.message}`,
      );
    }

    const { data: publicUrlData } =
      supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .getPublicUrl(newImagePath);

    newImageUrl = publicUrlData.publicUrl;
  }

  const { data: updatedProduct, error } =
    await supabase
      .from("products")
      .update({
        category_id: categoryId,
        name: name.trim(),
        sku,
        image_url: newImageUrl,
        description,
        cost_price: costPrice,
        selling_price: sellingPrice,
        low_stock_quantity: lowStockQuantity,
        is_active:
          formData.get("isActive") === "on",
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .eq("owner_id", user.id)
      .select("id, name")
      .single();

  if (error) {
    if (newImagePath) {
      await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .remove([newImagePath]);
    }

    if (error.code === "23505") {
      throw new Error(
        "The SKU is already in use.",
      );
    }

    throw new Error(error.message);
  }

  if (
    imageFile &&
    existingProduct.image_url &&
    existingProduct.image_url !== newImageUrl
  ) {
    const oldImagePath = getStoragePathFromUrl(
      existingProduct.image_url,
    );

    if (oldImagePath) {
      const { error: removeError } =
        await supabase.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .remove([oldImagePath]);

      if (removeError) {
        console.error(
          "Unable to remove old product image:",
          removeError.message,
        );
      }
    }
  }

  await createAuditLog({
    action: "update",
    entityType: "product",
    entityId: updatedProduct.id,
    description: `Updated product ${updatedProduct.name}`,
    metadata: {
      sku,
      image_changed: Boolean(imageFile),
      selling_price: sellingPrice,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  revalidatePath(
    `/dashboard/products/${productId}/edit`,
  );
  revalidatePath("/dashboard/audit-logs");

  redirect("/dashboard/products");
}

export async function adjustStock(formData: FormData) {
  const productId = formData.get("productId");
  const adjustmentType = formData.get("adjustmentType");
  const quantityValue = formData.get("quantity");
  const noteValue = formData.get("note");

  if (
    typeof productId !== "string" ||
    productId.length === 0
  ) {
    throw new Error("Invalid product ID.");
  }

  if (
    adjustmentType !== "increase" &&
    adjustmentType !== "decrease"
  ) {
    throw new Error("Invalid adjustment type.");
  }

  const quantity = Number(quantityValue);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(
      "Quantity must be a positive whole number.",
    );
  }

  const signedQuantity =
    adjustmentType === "increase"
      ? quantity
      : -quantity;

  const note =
    typeof noteValue === "string"
      ? noteValue.trim()
      : "";

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "adjust_product_stock",
    {
      p_product_id: productId,
      p_quantity: signedQuantity,
      p_note: note || null,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "stock_adjustment",
    entityType: "product",
    entityId: productId,
    description:
      adjustmentType === "increase"
        ? `Increased product stock by ${quantity}`
        : `Decreased product stock by ${quantity}`,
    metadata: {
      adjustment_type: adjustmentType,
      quantity,
      note: note || null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${productId}/edit`);
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/audit-logs");
}