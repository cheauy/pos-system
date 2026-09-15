"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

  if (business.product_mode !== "standard") {
    return {
      success: false,
      message: `This business uses ${business.product_mode} product mode. Use the matching product form.`,
    };
  }

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

  const size = getOptionalText(
    formData,
    "size",
  );

  const color = getOptionalText(
    formData,
    "color",
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
        barcode: sku,
        image_url: imageUrl,
        description,
        cost_price: costPrice,
        selling_price: sellingPrice,
        stock_quantity: stockQuantity,
        low_stock_quantity:
          lowStockQuantity,
        product_type: "standard",
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

  const size = getOptionalText(
    formData,
    "size",
  );

  const color = getOptionalText(
    formData,
    "color",
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
      size,
      color,
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

export async function toggleProductOnline(
  formData: FormData,
) {
  const business = await requirePermission(
    "products.update",
  );

  const productId = formData.get("productId");

  if (
    typeof productId !== "string" ||
    !productId
  ) {
    throw new Error("Invalid product ID.");
  }

  const supabase = await createClient();

  const {
    data: product,
    error: productError,
  } = await supabase
    .from("products")
    .select("id, name, is_online")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (productError || !product) {
    throw new Error(
      productError?.message ??
        "Product was not found.",
    );
  }

  const newOnlineStatus =
    !Boolean(product.is_online);

  const { error } = await supabase
    .from("products")
    .update({
      is_online: newOnlineStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("business_id", business.id);

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "update",
    entityType: "product",
    entityId: productId,
    description: newOnlineStatus
      ? `Published ${product.name} to the online store`
      : `Hidden ${product.name} from the online store`,
    metadata: {
      is_online: newOnlineStatus,
    },
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/online-store");
  revalidatePath(`/_sites/${business.slug}`);
}


// ---------------------------------------------------------------------------
// Variant products
// Each exact size/color SKU remains a normal products row so existing POS,
// inventory, bundle and reporting code keeps working. variant_group_id groups
// those rows into one public-store product card.
// ---------------------------------------------------------------------------
type VariantInput = {
  size: string;
  color: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  lowStockQuantity: number;
};

function parseVariantInputs(value: FormDataEntryValue | null): VariantInput[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): VariantInput | null => {
        if (!row || typeof row !== "object") return null;
        const source = row as Record<string, unknown>;
        const sku = typeof source.sku === "string" ? source.sku.trim() : "";
        const size = typeof source.size === "string" ? source.size.trim() : "";
        const color = typeof source.color === "string" ? source.color.trim() : "";
        const costPrice = Number(source.costPrice);
        const sellingPrice = Number(source.sellingPrice);
        const stockQuantity = Number(source.stockQuantity);
        const lowStockQuantity = Number(source.lowStockQuantity);
        if (
          !sku ||
          !Number.isFinite(costPrice) || costPrice < 0 ||
          !Number.isFinite(sellingPrice) || sellingPrice < 0 ||
          !Number.isInteger(stockQuantity) || stockQuantity < 0 ||
          !Number.isInteger(lowStockQuantity) || lowStockQuantity < 0
        ) return null;
        return {
          size,
          color,
          sku,
          costPrice,
          sellingPrice,
          stockQuantity,
          lowStockQuantity,
        };
      })
      .filter((row): row is VariantInput => row !== null);
  } catch {
    return [];
  }
}

export async function createVariantProduct(
  _previousState: CreateProductState,
  formData: FormData,
): Promise<CreateProductState> {
  const business = await requirePermission("products.create");

  if (business.product_mode !== "variant") {
    return {
      success: false,
      message: "This business is not using Variant product mode.",
    };
  }

  const nameValue = formData.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const categoryId = getOptionalText(formData, "categoryId");
  const description = getOptionalText(formData, "description");
  const variants = parseVariantInputs(formData.get("variants"));

  if (name.length < 2) {
    return { success: false, message: "Please enter a product name." };
  }

  if (variants.length === 0) {
    return { success: false, message: "Add at least one valid variant." };
  }

  const normalizedPairs = variants
    .map(
      (variant) => `${variant.color.trim().toLowerCase()}|${variant.size.trim().toLowerCase()}`,
    )
    .filter((pair) => pair !== "|");
  if (new Set(normalizedPairs).size !== normalizedPairs.length) {
    return {
      success: false,
      message: "Each size and colour combination must be unique.",
    };
  }

  const { data: storefrontMode } = await supabaseAdmin
    .from("business_storefronts")
    .select("business_type")
    .eq("business_id", business.id)
    .maybeSingle();

  if (
    ["shoes", "fashion"].includes(storefrontMode?.business_type ?? "") &&
    variants.some((variant) => !variant.size.trim() || !variant.color.trim())
  ) {
    return {
      success: false,
      message: "Shoes and Fashion require both a size and a colour for every inventory row.",
    };
  }

  const uniqueSkus = new Set(variants.map((variant) => variant.sku.toLowerCase()));
  if (uniqueSkus.size !== variants.length) {
    return { success: false, message: "Each variant must use a unique SKU." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("products")
    .select("sku")
    .eq("business_id", business.id)
    .in("sku", variants.map((variant) => variant.sku));

  if (existingError) {
    return { success: false, message: existingError.message };
  }

  if ((existing ?? []).length > 0) {
    return {
      success: false,
      message: `SKU ${(existing ?? [])[0]?.sku ?? ""} is already in use.`,
    };
  }

  const imageFile = getImageFile(formData);
  let imageUrl: string | null = null;
  let uploadedImagePath: string | null = null;

  if (imageFile) {
    const extension = getImageExtension(imageFile);
    uploadedImagePath = `${business.id}/${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(uploadedImagePath, imageFile, {
        contentType: imageFile.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) {
      return { success: false, message: `Unable to upload product image: ${uploadError.message}` };
    }
    imageUrl = supabaseAdmin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .getPublicUrl(uploadedImagePath).data.publicUrl;
  }

  const variantGroupId = crypto.randomUUID();
  const rows = variants.map((variant) => ({
    owner_id: user.id,
    business_id: business.id,
    category_id: categoryId,
    name,
    sku: variant.sku,
    barcode: variant.sku,
    size: variant.size || null,
    color: variant.color || null,
    image_url: imageUrl,
    description,
    cost_price: variant.costPrice,
    selling_price: variant.sellingPrice,
    stock_quantity: variant.stockQuantity,
    low_stock_quantity: variant.lowStockQuantity,
    product_type: "variant",
    variant_group_id: variantGroupId,
    is_active: true,
    is_online: true,
  }));

  const { data: created, error } = await supabaseAdmin
    .from("products")
    .insert(rows)
    .select("id, name, sku");

  if (error || !created) {
    if (uploadedImagePath) {
      await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedImagePath]);
    }
    return { success: false, message: error?.message ?? "Unable to create variants." };
  }

  await createAuditLog({
    action: "create",
    entityType: "product",
    entityId: created[0].id,
    description: `Created variant product ${name}`,
    metadata: {
      variant_group_id: variantGroupId,
      variants: created.map((row) => ({ id: row.id, sku: row.sku })),
    },
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");

  return {
    success: true,
    message: `${name} created with ${created.length} variant${created.length === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Configurable products
// Base stock/price remains in products. Option groups add checkout selections
// and optional price adjustments without generating every combination.
// ---------------------------------------------------------------------------
type ConfigurableOptionInput = {
  name: string;
  priceAdjustment: number;
  isDefault: boolean;
};

type ConfigurableGroupInput = {
  name: string;
  selectionType: "single" | "multiple";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: ConfigurableOptionInput[];
};

function parseConfigurableGroups(value: FormDataEntryValue | null): ConfigurableGroupInput[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): ConfigurableGroupInput | null => {
        if (!row || typeof row !== "object") return null;
        const source = row as Record<string, unknown>;
        const name = typeof source.name === "string" ? source.name.trim() : "";
        const selectionType = source.selectionType === "multiple" ? "multiple" : "single";
        const isRequired = Boolean(source.isRequired);
        const minSelections = Number(source.minSelections ?? (isRequired ? 1 : 0));
        const maxSelections = selectionType === "single" ? 1 : Number(source.maxSelections ?? 1);
        const rawOptions = Array.isArray(source.options) ? source.options : [];
        const options = rawOptions
          .map((option): ConfigurableOptionInput | null => {
            if (!option || typeof option !== "object") return null;
            const optionSource = option as Record<string, unknown>;
            const optionName = typeof optionSource.name === "string" ? optionSource.name.trim() : "";
            const priceAdjustment = Number(optionSource.priceAdjustment ?? 0);
            if (!optionName || !Number.isFinite(priceAdjustment) || priceAdjustment < 0) return null;
            return {
              name: optionName,
              priceAdjustment,
              isDefault: Boolean(optionSource.isDefault),
            };
          })
          .filter((option): option is ConfigurableOptionInput => option !== null);

        if (
          !name ||
          options.length === 0 ||
          !Number.isInteger(minSelections) || minSelections < 0 ||
          !Number.isInteger(maxSelections) || maxSelections < 1 ||
          minSelections > maxSelections ||
          maxSelections > options.length
        ) return null;

        return {
          name,
          selectionType,
          isRequired,
          minSelections,
          maxSelections,
          options,
        };
      })
      .filter((group): group is ConfigurableGroupInput => group !== null);
  } catch {
    return [];
  }
}

export async function createConfigurableProduct(
  _previousState: CreateProductState,
  formData: FormData,
): Promise<CreateProductState> {
  const business = await requirePermission("products.create");

  if (business.product_mode !== "configurable") {
    return {
      success: false,
      message: "This business is not using Configurable product mode.",
    };
  }

  const nameValue = formData.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const categoryId = getOptionalText(formData, "categoryId");
  const sku = getOptionalText(formData, "sku");
  const description = getOptionalText(formData, "description");
  const costPrice = getNumber(formData, "costPrice");
  const sellingPrice = getNumber(formData, "sellingPrice");
  const stockQuantity = getNumber(formData, "stockQuantity");
  const lowStockQuantity = getNumber(formData, "lowStockQuantity");
  const groups = parseConfigurableGroups(formData.get("optionGroups"));

  if (name.length < 2 || !sku) {
    return { success: false, message: "Product name and SKU are required." };
  }

  if (costPrice < 0 || sellingPrice < 0) {
    return { success: false, message: "Prices cannot be negative." };
  }

  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return { success: false, message: "Stock must be a whole number of zero or greater." };
  }

  if (!Number.isInteger(lowStockQuantity) || lowStockQuantity < 0) {
    return { success: false, message: "Low-stock alert must be zero or greater." };
  }

  if (groups.length === 0) {
    return { success: false, message: "Add at least one valid option group." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existingSku, error: skuError } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("business_id", business.id)
    .eq("sku", sku)
    .maybeSingle();

  if (skuError) return { success: false, message: skuError.message };
  if (existingSku) return { success: false, message: "This SKU is already in use." };

  const imageFile = getImageFile(formData);
  let imageUrl: string | null = null;
  let uploadedImagePath: string | null = null;

  if (imageFile) {
    const extension = getImageExtension(imageFile);
    uploadedImagePath = `${business.id}/${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(uploadedImagePath, imageFile, {
        contentType: imageFile.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) {
      return { success: false, message: `Unable to upload product image: ${uploadError.message}` };
    }
    imageUrl = supabaseAdmin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .getPublicUrl(uploadedImagePath).data.publicUrl;
  }

  const { data: product, error: productError } = await supabaseAdmin
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
      low_stock_quantity: lowStockQuantity,
      product_type: "configurable",
      is_active: true,
      is_online: true,
    })
    .select("id, name")
    .single();

  if (productError || !product) {
    if (uploadedImagePath) {
      await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedImagePath]);
    }
    return { success: false, message: productError?.message ?? "Unable to create product." };
  }

  try {
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      const { data: createdGroup, error: groupError } = await supabaseAdmin
        .from("product_option_groups")
        .insert({
          business_id: business.id,
          product_id: product.id,
          name: group.name,
          selection_type: group.selectionType,
          is_required: group.isRequired,
          min_selections: group.minSelections,
          max_selections: group.maxSelections,
          sort_order: groupIndex,
        })
        .select("id")
        .single();

      if (groupError || !createdGroup) {
        throw new Error(groupError?.message ?? "Unable to create option group.");
      }

      const { error: optionsError } = await supabaseAdmin
        .from("product_options")
        .insert(
          group.options.map((option, optionIndex) => ({
            business_id: business.id,
            product_id: product.id,
            group_id: createdGroup.id,
            name: option.name,
            price_adjustment: option.priceAdjustment,
            is_default: option.isDefault,
            sort_order: optionIndex,
          })),
        );

      if (optionsError) throw new Error(optionsError.message);
    }
  } catch (error) {
    await supabaseAdmin.from("products").delete().eq("id", product.id);
    if (uploadedImagePath) {
      await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedImagePath]);
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to create product options.",
    };
  }

  await createAuditLog({
    action: "create",
    entityType: "product",
    entityId: product.id,
    description: `Created configurable product ${product.name}`,
    metadata: {
      sku,
      option_groups: groups.length,
    },
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");

  return {
    success: true,
    message: `${product.name} created successfully.`,
  };
}
