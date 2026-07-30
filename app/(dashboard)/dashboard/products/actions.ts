"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { createClient } from "@/lib/supabase/server";
import {
  requirePermission,
} from "@/lib/auth/require-permission";

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

export type CreateProductState = {
  success: boolean;
  message: string;
};

const emptyState: CreateProductState = {
  success: false,
  message: "",
};

export async function createProduct(
  previousState: CreateProductState,
  formData: FormData,
): Promise<CreateProductState> {
  const business = await requirePermission(
    "products.create",
  );

  const nameValue = formData.get("name");

  const name =
    typeof nameValue === "string"
      ? nameValue.trim()
      : "";

  if (!name) {
    return {
      success: false,
      message: "Please enter the product name.",
    };
  }

  if (name.length < 2) {
    return {
      success: false,
      message:
        "Product name must contain at least 2 characters.",
    };
  }

  const categoryId = getOptionalText(
    formData,
    "categoryId",
  );

  const skuValue = getOptionalText(
    formData,
    "sku",
  );

  const sku = skuValue?.trim() || null;

  if (!sku) {
    return {
      success: false,
      message: "Please enter the product SKU.",
    };
  }

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
    typeof lowStockValue === "string" &&
    lowStockValue.trim() !== ""
      ? Number(lowStockValue)
      : 5;

  if (
    !Number.isFinite(costPrice) ||
    !Number.isFinite(sellingPrice)
  ) {
    return {
      success: false,
      message: "Please enter valid prices.",
    };
  }

  if (
    costPrice < 0 ||
    sellingPrice < 0
  ) {
    return {
      success: false,
      message: "Prices cannot be negative.",
    };
  }

  if (
    !Number.isInteger(stockQuantity) ||
    stockQuantity < 0
  ) {
    return {
      success: false,
      message:
        "Stock quantity must be zero or a positive whole number.",
    };
  }

  if (
    !Number.isInteger(lowStockQuantity) ||
    lowStockQuantity < 0
  ) {
    return {
      success: false,
      message:
        "Low-stock quantity must be zero or greater.",
    };
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
    error: skuCheckError,
  } = await supabase
    .from("products")
    .select("id")
    .eq("business_id", business.id)
    .eq("sku", sku)
    .maybeSingle();

  if (skuCheckError) {
    return {
      success: false,
      message: skuCheckError.message,
    };
  }

  let imageUrl: string | null = null;
  let uploadedImagePath: string | null =
    null;

  if (imageFile) {
    const extension =
      getImageExtension(imageFile);

    uploadedImagePath =
      `${business.id}/${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } =
      await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .upload(
          uploadedImagePath,
          imageFile,
          {
            contentType: imageFile.type,
            cacheControl: "3600",
            upsert: false,
          },
        );

    if (uploadError) {
      return {
        success: false,
        message:
          `Unable to upload product image: ${uploadError.message}`,
      };
    }

    const { data: publicUrlData } =
      supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .getPublicUrl(
          uploadedImagePath,
        );

    imageUrl =
      publicUrlData.publicUrl;
  }

  const { data: product, error } =
    await supabase
      .from("products")
      .insert({
        owner_id: user.id,
        business_id: business.id,
        category_id: categoryId,
        name,
        sku,
        image_url: imageUrl,
        description,
        cost_price: costPrice,
        selling_price: sellingPrice,
        stock_quantity: stockQuantity,
        low_stock_quantity:
          lowStockQuantity,
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
      return {
        success: false,
        message:
          "This SKU is already used by another product in this business.",
      };
    }

    return {
      success: false,
      message: error.message,
    };
  }

  await createAuditLog({
    action: "create",
    entityType: "product",
    entityId: product.id,
    description:
      `Created product ${product.name}`,
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

  return {
    success: true,
    message: `${product.name} created successfully.`,
  };
}

export async function toggleProductStatus(
  formData: FormData,
) {
  const productId = formData.get("productId");
  const business = await requirePermission(
  "products.disable",
);

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
      .eq("business_id", business.id)
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
export async function updateProduct(
  formData: FormData,
): Promise<void> {
  const productIdValue =
    formData.get("productId");

  const nameValue =
    formData.get("name");

  const business = await requirePermission(
    "products.update",
  );

  const productId =
    typeof productIdValue === "string"
      ? productIdValue.trim()
      : "";

  const name =
    typeof nameValue === "string"
      ? nameValue.trim()
      : "";

  if (!productId) {
    throw new Error("Invalid product ID.");
  }

  if (name.length < 2) {
    redirect(
      `/dashboard/products/${productId}/edit?error=name-invalid`,
    );
  }

  const categoryId = getOptionalText(
    formData,
    "categoryId",
  );

  const skuValue = getOptionalText(
    formData,
    "sku",
  );

  const sku = skuValue?.trim() || null;

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

  const lowStockValue =
    formData.get("lowStockQuantity");

  const lowStockQuantity =
    typeof lowStockValue === "string" &&
    lowStockValue.trim() !== ""
      ? Number(lowStockValue)
      : 5;

  if (
    !Number.isFinite(costPrice) ||
    !Number.isFinite(sellingPrice) ||
    costPrice < 0 ||
    sellingPrice < 0
  ) {
    redirect(
      `/dashboard/products/${productId}/edit?error=invalid-price`,
    );
  }

  if (
    !Number.isInteger(lowStockQuantity) ||
    lowStockQuantity < 0
  ) {
    redirect(
      `/dashboard/products/${productId}/edit?error=invalid-low-stock`,
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
    .eq("business_id", business.id)
    .maybeSingle();

  if (existingProductError) {
    throw new Error(
      existingProductError.message,
    );
  }

  if (!existingProduct) {
    throw new Error(
      "Product was not found in this business.",
    );
  }

  /*
   * Check whether another product in this
   * business already uses the same SKU.
   */
  if (sku) {
    const {
      data: duplicateSkuProduct,
      error: duplicateSkuError,
    } = await supabase
      .from("products")
      .select("id")
      .eq("business_id", business.id)
      .eq("sku", sku)
      .neq("id", productId)
      .maybeSingle();

    if (duplicateSkuError) {
      throw new Error(
        duplicateSkuError.message,
      );
    }

    if (duplicateSkuProduct) {
      redirect(
        `/dashboard/products/${productId}/edit?error=sku-already-used`,
      );
    }
  }

  let newImageUrl =
    existingProduct.image_url;

  let newImagePath: string | null =
    null;

  if (imageFile) {
    const extension =
      getImageExtension(imageFile);

    newImagePath =
      `${business.id}/${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } =
      await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .upload(
          newImagePath,
          imageFile,
          {
            contentType: imageFile.type,
            cacheControl: "3600",
            upsert: false,
          },
        );

    if (uploadError) {
      redirect(
        `/dashboard/products/${productId}/edit?error=image-upload-failed`,
      );
    }

    const { data: publicUrlData } =
      supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .getPublicUrl(newImagePath);

    newImageUrl =
      publicUrlData.publicUrl;
  }

  const {
    data: updatedProduct,
    error,
  } = await supabase
    .from("products")
    .update({
      category_id: categoryId,
      name,
      sku,
      image_url: newImageUrl,
      description,
      cost_price: costPrice,
      selling_price: sellingPrice,
      low_stock_quantity:
        lowStockQuantity,
      is_active:
        formData.get("isActive") === "on",
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("business_id", business.id)
    .select("id, name")
    .single();

  if (error) {
    if (newImagePath) {
      await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .remove([newImagePath]);
    }

    if (error.code === "23505") {
      redirect(
        `/dashboard/products/${productId}/edit?error=sku-already-used`,
      );
    }

    throw new Error(error.message);
  }

  if (
    imageFile &&
    existingProduct.image_url &&
    existingProduct.image_url !==
      newImageUrl
  ) {
    const oldImagePath =
      getStoragePathFromUrl(
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
    description:
      `Updated product ${updatedProduct.name}`,
    metadata: {
      business_id: business.id,
      sku,
      image_changed:
        Boolean(imageFile),
      selling_price: sellingPrice,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  revalidatePath(
    `/dashboard/products/${productId}/edit`,
  );
  revalidatePath(
    "/dashboard/audit-logs",
  );

  redirect(
    `/dashboard/products/${productId}/edit?success=updated`,
  );
}
export async function adjustStock(
  formData: FormData,
): Promise<void> {
  const business = await requirePermission(
    "products.stock_adjust",
  );

  const productIdValue =
    formData.get("productId");

  const adjustmentTypeValue =
    formData.get("adjustmentType");

  const quantityValue =
    formData.get("quantity");

  const noteValue =
    formData.get("note");

  const productId =
    typeof productIdValue === "string"
      ? productIdValue.trim()
      : "";

  const adjustmentType =
    typeof adjustmentTypeValue === "string"
      ? adjustmentTypeValue
      : "";

  const quantity =
    typeof quantityValue === "string"
      ? Number(quantityValue)
      : Number.NaN;

  const note =
    typeof noteValue === "string"
      ? noteValue.trim()
      : "";

  if (!productId) {
    throw new Error(
      "Invalid product ID.",
    );
  }

  if (
    adjustmentType !== "increase" &&
    adjustmentType !== "decrease"
  ) {
    throw new Error(
      "Invalid adjustment type.",
    );
  }

  if (
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      "Quantity must be a positive whole number.",
    );
  }

  const signedQuantity =
    adjustmentType === "increase"
      ? quantity
      : -quantity;

  const supabase = await createClient();

  /*
   * Verify that the product belongs to the
   * current business before calling the RPC.
   */
  const {
    data: existingProduct,
    error: productError,
  } = await supabase
    .from("products")
    .select("id, name, stock_quantity")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (productError) {
    throw new Error(
      `Unable to load product: ${productError.message}`,
    );
  }

  if (!existingProduct) {
    throw new Error(
      "Product was not found in this business.",
    );
  }

  const {
    data: newStock,
    error: adjustmentError,
  } = await supabase.rpc(
    "adjust_product_stock",
    {
      p_business_id: business.id,
      p_product_id: productId,
      p_quantity: signedQuantity,
      p_note: note || null,
    },
  );

  if (adjustmentError) {
    throw new Error(
      adjustmentError.message,
    );
  }

  await createAuditLog({
    action: "stock_adjustment",
    entityType: "product",
    entityId: productId,
    description:
      adjustmentType === "increase"
        ? `Increased ${existingProduct.name} stock by ${quantity}`
        : `Decreased ${existingProduct.name} stock by ${quantity}`,
    metadata: {
      business_id: business.id,
      adjustment_type: adjustmentType,
      quantity,
      signed_quantity: signedQuantity,
      previous_stock:
        existingProduct.stock_quantity,
      new_stock: newStock,
      note: note || null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath(
    `/dashboard/products/${productId}/edit`,
  );
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/audit-logs");

  redirect(
  `/dashboard/products/${productId}/edit?success=stock-updated`,
);
}
