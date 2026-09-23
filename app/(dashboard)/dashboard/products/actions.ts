"use server";

import { revalidatePath } from "next/cache";
import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { getCurrentBusinessMode } from "@/lib/business/get-current-business-mode";
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

async function assertCategoryBelongsToBusiness(
  businessId: string,
  categoryId: string | null,
) {
  if (!categoryId) return;

  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to validate category: ${error.message}`);
  }

  if (!data) {
    throw new Error("The selected category does not belong to this business.");
  }
}

const PRODUCT_IMAGE_BUCKET = "product-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function getImageFile(formData: FormData, key = "image"): File | null {
  const value = formData.get(key);

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

  let initialBranch:string;
  try { initialBranch=await initialProductBranch(business.id,formData); } catch(error){return {success:false,message:error instanceof Error?error.message:"Choose an active branch."};}
  const currentBusinessMode = await getCurrentBusinessMode({
    businessId: business.id,
    productMode: business.productMode,
  });

  if (currentBusinessMode.productMode !== "standard") {
    return {
      success: false,
      message: `This business uses ${currentBusinessMode.productMode} product mode. Use the matching product form.`,
    };
  }

  const isGeneralShop = currentBusinessMode.value === "general";
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

  await assertCategoryBelongsToBusiness(business.id, categoryId);

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

  const barcodeInput = isGeneralShop
    ? getOptionalText(formData, "barcode")
    : null;
  const barcode = isGeneralShop ? barcodeInput ?? sku : sku;
  const size = isGeneralShop ? getOptionalText(formData, "size") : null;
  const color = isGeneralShop ? getOptionalText(formData, "color") : null;
  const isOnline = isGeneralShop ? formData.get("isOnline") === "on" : true;

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

  if (isGeneralShop && existingProduct) {
    return {
      success: false,
      message: "This SKU is already used by another product in this business.",
    };
  }

  if (isGeneralShop && barcode) {
    const { data: existingBarcode, error: barcodeCheckError } = await supabase
      .from("products")
      .select("id")
      .eq("business_id", business.id)
      .eq("barcode", barcode)
      .maybeSingle();

    if (barcodeCheckError) {
      return { success: false, message: barcodeCheckError.message };
    }

    if (existingBarcode) {
      return {
        success: false,
        message: "This barcode is already used by another product in this business.",
      };
    }
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
        barcode,
        image_url: imageUrl,
        description,
        cost_price: costPrice,
        selling_price: sellingPrice,
        stock_quantity: stockQuantity,
        low_stock_quantity:
          lowStockQuantity,
        product_type: "standard",
        is_active: true,
        ...(isGeneralShop
          ? { size, color, is_online: isOnline }
          : {}),
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

  const assignmentWarning=await assignCreatedProducts(business.id,initialBranch,[product.id]);
  await createAuditLog({
    action: "create",
    entityType: "product",
    entityId: product.id,
    description:
      `Created product ${product.name}`,
    metadata: {
      sku,
      ...(isGeneralShop
        ? { barcode, size, color, is_online: isOnline }
        : {}),
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
    message: `${product.name} created successfully.` + assignmentWarning,
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
    .eq("id", productId)
    .eq("business_id", business.id);

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

  await assertCategoryBelongsToBusiness(business.id, categoryId);

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


export type ProductRowActionResult = {
  success: boolean;
  message: string;
};

export async function setProductGroupOnline(
  productId: string,
  visible: boolean,
): Promise<ProductRowActionResult> {
  const business = await requirePermission("products.update");

  if (!productId) {
    return { success: false, message: "Invalid product ID." };
  }

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, product_type, variant_group_id")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (productError || !product) {
    return {
      success: false,
      message: productError?.message ?? "Product was not found.",
    };
  }

  let ids: string[] = [product.id];
  if (product.product_type === "variant" && product.variant_group_id) {
    const { data: groupRows, error: groupError } = await supabase
      .from("products")
      .select("id")
      .eq("business_id", business.id)
      .eq("variant_group_id", product.variant_group_id);

    if (groupError) {
      return { success: false, message: groupError.message };
    }
    ids = (groupRows ?? []).map((row) => row.id);
  }

  if (ids.length === 0) {
    return { success: false, message: "Product was not found." };
  }

  const { error } = await supabase
    .from("products")
    .update({
      is_online: visible,
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", business.id)
    .in("id", ids);

  if (error) {
    return { success: false, message: error.message };
  }

  await createAuditLog({
    action: "update",
    entityType: "product",
    entityId: product.id,
    description: visible
      ? `Published ${product.name} to the online store`
      : `Hidden ${product.name} from the online store`,
    metadata: {
      is_online: visible,
      affected_product_rows: ids.length,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/online-store");
  revalidatePath(`/_sites/${business.slug}`);

  return {
    success: true,
    message: visible
      ? `${product.name} is visible online.`
      : `${product.name} is hidden from the online store.`,
  };
}

export async function setProductGroupActive(
  productId: string,
  active: boolean,
): Promise<ProductRowActionResult> {
  const business = await requirePermission("products.disable");
  if (!productId) return { success: false, message: "Invalid product ID." };

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, product_type, variant_group_id")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (productError || !product) {
    return { success: false, message: productError?.message ?? "Product was not found." };
  }

  let query = supabase.from("products").select("id").eq("business_id", business.id);
  query = product.product_type === "variant" && product.variant_group_id
    ? query.eq("variant_group_id", product.variant_group_id)
    : query.eq("id", product.id);
  const { data: rows, error: rowsError } = await query;
  if (rowsError) return { success: false, message: rowsError.message };
  const ids = (rows ?? []).map((row) => row.id);
  if (ids.length === 0) return { success: false, message: "Product was not found." };

  const payload: Record<string, unknown> = {
    is_active: active,
    updated_at: new Date().toISOString(),
  };
  if (!active) payload.is_online = false;

  const { error } = await supabase
    .from("products")
    .update(payload)
    .eq("business_id", business.id)
    .in("id", ids);
  if (error) return { success: false, message: error.message };

  await createAuditLog({
    action: "update",
    entityType: "product",
    entityId: product.id,
    description: active ? `Activated ${product.name}` : `Hid ${product.name}`,
    metadata: { is_active: active, affected_product_rows: ids.length },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");
  revalidatePath(`/_sites/${business.slug}`);
  return {
    success: true,
    message: active
      ? `${product.name} is active again.`
      : `${product.name} is inactive and hidden from POS and online.`,
  };
}

export async function setProductVariantsActive(
  productId: string,
  variantIds: string[],
  active: boolean,
): Promise<ProductRowActionResult> {
  const business = await requirePermission("products.disable");
  const uniqueIds = Array.from(new Set(variantIds.filter(Boolean)));
  if (!productId || uniqueIds.length === 0) {
    return { success: false, message: "Select at least one variant." };
  }

  const supabase = await createClient();
  const { data: representative, error: representativeError } = await supabase
    .from("products")
    .select("id, name, product_type, variant_group_id")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (representativeError || !representative) {
    return { success: false, message: representativeError?.message ?? "Product was not found." };
  }

  let groupQuery = supabase.from("products").select("id").eq("business_id", business.id);
  groupQuery = representative.product_type === "variant" && representative.variant_group_id
    ? groupQuery.eq("variant_group_id", representative.variant_group_id)
    : groupQuery.eq("id", representative.id);
  const { data: groupRows, error: groupError } = await groupQuery;
  if (groupError) return { success: false, message: groupError.message };
  const allowedIds = new Set((groupRows ?? []).map((row) => row.id));
  if (uniqueIds.some((id) => !allowedIds.has(id))) {
    return { success: false, message: "One selected variant does not belong to this product." };
  }

  const payload: Record<string, unknown> = {
    is_active: active,
    updated_at: new Date().toISOString(),
  };
  if (!active) payload.is_online = false;
  const { error } = await supabase
    .from("products")
    .update(payload)
    .eq("business_id", business.id)
    .in("id", uniqueIds);
  if (error) return { success: false, message: error.message };

  await createAuditLog({
    action: "update",
    entityType: "product",
    entityId: representative.id,
    description: active ? `Activated ${uniqueIds.length} variants` : `Hid ${uniqueIds.length} variants`,
    metadata: { variant_ids: uniqueIds, is_active: active },
  });

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${representative.id}/edit`);
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");
  revalidatePath(`/_sites/${business.slug}`);
  return {
    success: true,
    message: active ? `${uniqueIds.length} variants activated.` : `${uniqueIds.length} variants hidden.`,
  };
}

export async function deleteProductVariants(
  productId: string,
  variantIds: string[],
): Promise<ProductRowActionResult> {
  const business = await requirePermission("products.disable");
  const uniqueIds = Array.from(new Set(variantIds.filter(Boolean)));
  if (!productId || uniqueIds.length === 0) {
    return { success: false, message: "Select at least one variant." };
  }

  const supabase = await createClient();
  const { data: representative, error: representativeError } = await supabase
    .from("products")
    .select("id, name, product_type, variant_group_id")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (representativeError || !representative) {
    return { success: false, message: representativeError?.message ?? "Product was not found." };
  }

  let groupQuery = supabase
    .from("products")
    .select("id, image_url, variant_image_url")
    .eq("business_id", business.id);
  groupQuery = representative.product_type === "variant" && representative.variant_group_id
    ? groupQuery.eq("variant_group_id", representative.variant_group_id)
    : groupQuery.eq("id", representative.id);
  const { data: groupRows, error: groupError } = await groupQuery;
  if (groupError) return { success: false, message: groupError.message };
  const rows = groupRows ?? [];
  const allowedIds = new Set(rows.map((row) => row.id));
  if (uniqueIds.some((id) => !allowedIds.has(id))) {
    return { success: false, message: "One selected variant does not belong to this product." };
  }
  if (rows.length - uniqueIds.length < 1) {
    return { success: false, message: "Keep at least one variant. Use Delete Product to remove the whole style." };
  }

  const imageUrls = Array.from(
    new Set(
      rows
        .filter((row) => uniqueIds.includes(row.id))
        .flatMap((row) => [row.image_url, row.variant_image_url])
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const { error: deleteError } = await supabase
    .from("products")
    .delete()
    .eq("business_id", business.id)
    .in("id", uniqueIds);
  if (deleteError) {
    if (deleteError.code === "23503") {
      return { success: false, message: "One or more selected variants are already used in sales, purchases, bundles, or inventory history. Hide them instead." };
    }
    return { success: false, message: deleteError.message };
  }

  for (const imageUrl of imageUrls) {
    const { data: remaining } = await supabase
      .from("products")
      .select("id")
      .eq("business_id", business.id)
      .or(`image_url.eq.${imageUrl},variant_image_url.eq.${imageUrl}`)
      .limit(1);
    if ((remaining ?? []).length > 0) continue;
    const storagePath = getStoragePathFromUrl(imageUrl);
    if (storagePath) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([storagePath]);
  }

  await createAuditLog({
    action: "delete",
    entityType: "product",
    entityId: representative.id,
    description: `Deleted ${uniqueIds.length} variants from ${representative.name}`,
    metadata: { variant_ids: uniqueIds },
  });

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${representative.id}/edit`);
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");
  revalidatePath(`/_sites/${business.slug}`);
  return { success: true, message: `${uniqueIds.length} variants deleted.` };
}

export async function deleteProductGroup(
  productId: string,
): Promise<ProductRowActionResult> {
  const business = await requirePermission("products.disable");

  if (!productId) {
    return { success: false, message: "Invalid product ID." };
  }

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, product_type, variant_group_id")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (productError || !product) {
    return {
      success: false,
      message: productError?.message ?? "Product was not found.",
    };
  }

  let groupQuery = supabase
    .from("products")
    .select("id, image_url, variant_image_url")
    .eq("business_id", business.id);

  groupQuery =
    product.product_type === "variant" && product.variant_group_id
      ? groupQuery.eq("variant_group_id", product.variant_group_id)
      : groupQuery.eq("id", product.id);

  const { data: groupRows, error: groupError } = await groupQuery;
  if (groupError) {
    return { success: false, message: groupError.message };
  }

  const ids = (groupRows ?? []).map((row) => row.id);
  if (ids.length === 0) {
    return { success: false, message: "Product was not found." };
  }

  const imageUrls = Array.from(
    new Set(
      (groupRows ?? [])
        .flatMap((row) => [row.image_url, row.variant_image_url])
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const { error: deleteError } = await supabase
    .from("products")
    .delete()
    .eq("business_id", business.id)
    .in("id", ids);

  if (deleteError) {
    if (deleteError.code === "23503") {
      return {
        success: false,
        message:
          "This product is already used in an order, purchase, bundle, or inventory history. Hide it instead so historical records stay safe.",
      };
    }
    return { success: false, message: deleteError.message };
  }

  for (const imageUrl of imageUrls) {
    const { data: remaining } = await supabase
      .from("products")
      .select("id")
      .eq("business_id", business.id)
      .or(`image_url.eq.${imageUrl},variant_image_url.eq.${imageUrl}`)
      .limit(1);

    if ((remaining ?? []).length > 0) continue;
    const storagePath = getStoragePathFromUrl(imageUrl);
    if (storagePath) {
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([storagePath]);
    }
  }

  await createAuditLog({
    action: "delete",
    entityType: "product",
    entityId: product.id,
    description: `Deleted ${product.name}`,
    metadata: {
      affected_product_rows: ids.length,
      variant_group_id: product.variant_group_id,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");
  revalidatePath("/dashboard/audit-logs");
  revalidatePath(`/_sites/${business.slug}`);

  return {
    success: true,
    message: `${product.name} deleted successfully.`,
  };
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
  imageSlot: string | null;
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
        const imageSlot =
          typeof source.imageSlot === "string" && source.imageSlot.trim()
            ? source.imageSlot.trim()
            : null;
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
          imageSlot,
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

  let initialBranch:string;
  try { initialBranch=await initialProductBranch(business.id,formData); } catch(error){return {success:false,message:error instanceof Error?error.message:"Choose an active branch."};}
  const currentBusinessMode = await getCurrentBusinessMode({
    businessId: business.id,
    productMode: business.productMode,
  });

  if (
    currentBusinessMode.productMode !== "variant" &&
    currentBusinessMode.value !== "general"
  ) {
    return {
      success: false,
      message: "This business is not using a product mode that supports variants.",
    };
  }

  const nameValue = formData.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const categoryId = getOptionalText(formData, "categoryId");
  await assertCategoryBelongsToBusiness(business.id, categoryId);
  const description = getOptionalText(formData, "description");
  const isOnline =
    currentBusinessMode.value === "general"
      ? formData.get("isOnline") === "on"
      : true;
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

  if (
    ["shoes", "fashion"].includes(currentBusinessMode.value) &&
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
  const userId = user.id;

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
  const imageSlots = Array.from(
    new Set(
      variants
        .map((variant) => variant.imageSlot)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  let imageUrl: string | null = null;
  const runImageUrls = new Map<string, string>();
  const uploadedImagePaths: string[] = [];

  async function uploadVariantImage(file: File, label: string) {
    const extension = getImageExtension(file);
    const path = `${business.id}/${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`Unable to upload ${label}: ${uploadError.message}`);
    }
    uploadedImagePaths.push(path);
    return supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  try {
    if (imageFile) imageUrl = await uploadVariantImage(imageFile, "product image");
    for (const slot of imageSlots) {
      const runImageFile = getImageFile(formData, `runImage_${slot}`);
      if (!runImageFile) continue;
      runImageUrls.set(
        slot,
        await uploadVariantImage(runImageFile, "colour / size-run image"),
      );
    }
  } catch (error) {
    if (uploadedImagePaths.length > 0) {
      await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedImagePaths);
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to upload product image.",
    };
  }

  const variantGroupId = crypto.randomUUID();
  const rows = variants.map((variant) => ({
    owner_id: userId,
    business_id: business.id,
    category_id: categoryId,
    name,
    sku: variant.sku,
    barcode: variant.sku,
    size: variant.size || null,
    color: variant.color || null,
    image_url: imageUrl,
    variant_image_url: variant.imageSlot
      ? runImageUrls.get(variant.imageSlot) ?? null
      : null,
    description,
    cost_price: variant.costPrice,
    selling_price: variant.sellingPrice,
    stock_quantity: variant.stockQuantity,
    low_stock_quantity: variant.lowStockQuantity,
    product_type: "variant",
    variant_group_id: variantGroupId,
    is_active: true,
    is_online: isOnline,
  }));

  const { data: created, error } = await supabaseAdmin
    .from("products")
    .insert(rows)
    .select("id, name, sku");

  if (error || !created) {
    if (uploadedImagePaths.length > 0) {
      await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedImagePaths);
    }
    return { success: false, message: error?.message ?? "Unable to create variants." };
  }

  const assignmentWarning=await assignCreatedProducts(business.id,initialBranch,created.map(p=>p.id));
  await createAuditLog({
    action: "create",
    entityType: "product",
    entityId: created[0].id,
    description: `Created variant product ${name}`,
    metadata: {
      variant_group_id: variantGroupId,
      variants: created.map((row) => ({ id: row.id, sku: row.sku })),
      run_images: runImageUrls.size,
    },
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");

  return {
    success: true,
    message: `${name} created with ${created.length} variant${created.length === 1 ? "" : "s"}.` + assignmentWarning,
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

  let initialBranch:string;
  try { initialBranch=await initialProductBranch(business.id,formData); } catch(error){return {success:false,message:error instanceof Error?error.message:"Choose an active branch."};}
  const currentBusinessMode = await getCurrentBusinessMode({
    businessId: business.id,
    productMode: business.productMode,
  });

  if (currentBusinessMode.productMode !== "configurable") {
    return {
      success: false,
      message: "This business is not using Configurable product mode.",
    };
  }

  const nameValue = formData.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const categoryId = getOptionalText(formData, "categoryId");
  await assertCategoryBelongsToBusiness(business.id, categoryId);
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
    await supabaseAdmin.from("products").delete().eq("id", product.id).eq("business_id", business.id);
    if (uploadedImagePath) {
      await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedImagePath]);
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to create product options.",
    };
  }

  const assignmentWarning=await assignCreatedProducts(business.id,initialBranch,[product.id]);
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
    message: `${product.name} created successfully.` + assignmentWarning,
  };
}

// ---------------------------------------------------------------------------
// Professional product/style editor
// Updates one product row or an entire variant style without exposing online-
// store controls in the edit UI. Existing stock changes still go through the
// stock-adjustment RPC so inventory history remains intact.
// ---------------------------------------------------------------------------
export type UpdateProductGroupState = {
  success: boolean;
  message: string;
};

type EditVariantInput = {
  id: string | null;
  size: string;
  color: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  lowStockQuantity: number;
  isActive: boolean;
  imageSlot: string | null;
};

function parseEditVariants(value: FormDataEntryValue | null): EditVariantInput[] {
  if (typeof value !== "string") return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((row): EditVariantInput | null => {
        if (!row || typeof row !== "object") return null;
        const source = row as Record<string, unknown>;
        const id = typeof source.id === "string" && source.id.trim() ? source.id.trim() : null;
        const size = typeof source.size === "string" ? source.size.trim() : "";
        const color = typeof source.color === "string" ? source.color.trim() : "";
        const sku = typeof source.sku === "string" ? source.sku.trim() : "";
        const costPrice = Number(source.costPrice);
        const sellingPrice = Number(source.sellingPrice);
        const stockQuantity = Number(source.stockQuantity);
        const lowStockQuantity = Number(source.lowStockQuantity);
        const isActive = Boolean(source.isActive);
        const imageSlot =
          typeof source.imageSlot === "string" && source.imageSlot.trim()
            ? source.imageSlot.trim()
            : null;

        if (
          !sku ||
          !Number.isFinite(costPrice) || costPrice < 0 ||
          !Number.isFinite(sellingPrice) || sellingPrice < 0 ||
          !Number.isInteger(stockQuantity) || stockQuantity < 0 ||
          !Number.isInteger(lowStockQuantity) || lowStockQuantity < 0
        ) {
          return null;
        }

        return {
          id,
          size,
          color,
          sku,
          costPrice,
          sellingPrice,
          stockQuantity,
          lowStockQuantity,
          isActive,
          imageSlot,
        };
      })
      .filter((row): row is EditVariantInput => row !== null);
  } catch {
    return [];
  }
}

export async function updateProductGroup(
  _previousState: UpdateProductGroupState,
  formData: FormData,
): Promise<UpdateProductGroupState> {
  const business = await requirePermission("products.update");
  const currentBusinessMode = await getCurrentBusinessMode({
    businessId: business.id,
    productMode: business.productMode,
  });
  const isGeneralShop = currentBusinessMode.value === "general";
  const productIdValue = formData.get("productId");
  const nameValue = formData.get("name");
  const productId = typeof productIdValue === "string" ? productIdValue.trim() : "";
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const categoryId = getOptionalText(formData, "categoryId");
  const description = getOptionalText(formData, "description");
  const isOnline = formData.get("isOnline") === "true";
  const variants = parseEditVariants(formData.get("variants"));
  const requestedBarcode = isGeneralShop ? getOptionalText(formData, "barcode") : null;

  if (!productId) return { success: false, message: "Invalid product ID." };
  if (name.length < 2) return { success: false, message: "Product name must contain at least 2 characters." };
  if (variants.length === 0) return { success: false, message: "Add at least one valid variant." };

  await assertCategoryBelongsToBusiness(business.id, categoryId);

  const localSkus = variants.map((variant) => variant.sku.toLowerCase());
  if (new Set(localSkus).size !== localSkus.length) {
    return { success: false, message: "Every variant must use a unique SKU." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const userId = user.id;

  const { data: representative, error: representativeError } = await supabase
    .from("products")
    .select("id, name, product_type, variant_group_id, image_url, is_online")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (representativeError || !representative) {
    return {
      success: false,
      message: representativeError?.message ?? "Product was not found.",
    };
  }

  let currentQuery = supabase
    .from("products")
    .select("id, sku, stock_quantity, image_url, variant_image_url")
    .eq("business_id", business.id);

  currentQuery =
    representative.product_type === "variant" && representative.variant_group_id
      ? currentQuery.eq("variant_group_id", representative.variant_group_id)
      : currentQuery.eq("id", representative.id);

  const { data: currentRows, error: currentRowsError } = await currentQuery;
  if (currentRowsError) {
    return { success: false, message: currentRowsError.message };
  }

  const current = currentRows ?? [];
  const currentIds = new Set(current.map((row) => row.id));
  const submittedExistingIds = variants
    .map((variant) => variant.id)
    .filter((value): value is string => Boolean(value));

  if (submittedExistingIds.some((id) => !currentIds.has(id))) {
    return { success: false, message: "One of these variants does not belong to this product." };
  }

  const supportsVariants =
    representative.product_type === "variant" && Boolean(representative.variant_group_id);

  if (!supportsVariants && (variants.length !== 1 || variants[0].id !== representative.id)) {
    return { success: false, message: "This product does not support multiple variants." };
  }

  const generalBarcode = isGeneralShop && !supportsVariants
    ? requestedBarcode ?? variants[0]?.sku ?? null
    : null;

  if (isGeneralShop && !supportsVariants && generalBarcode) {
    const { data: barcodeMatches, error: barcodeCheckError } = await supabase
      .from("products")
      .select("id")
      .eq("business_id", business.id)
      .eq("barcode", generalBarcode)
      .neq("id", representative.id)
      .limit(1);

    if (barcodeCheckError) {
      return { success: false, message: barcodeCheckError.message };
    }
    if ((barcodeMatches ?? []).length > 0) {
      return { success: false, message: "This barcode is already used by another product in this business." };
    }
  }

  if (supportsVariants) {
    const normalizedPairs = variants
      .map((variant) => `${variant.color.toLowerCase()}|${variant.size.toLowerCase()}`)
      .filter((pair) => pair !== "|");
    if (new Set(normalizedPairs).size !== normalizedPairs.length) {
      return { success: false, message: "Each size and colour combination must be unique." };
    }
  }

  const { data: duplicateRows, error: duplicateError } = await supabase
    .from("products")
    .select("id, sku")
    .eq("business_id", business.id)
    .in("sku", variants.map((variant) => variant.sku));

  if (duplicateError) {
    return { success: false, message: duplicateError.message };
  }

  const externalDuplicate = (duplicateRows ?? []).find((row) => !currentIds.has(row.id));
  if (externalDuplicate) {
    return {
      success: false,
      message: `SKU ${externalDuplicate.sku ?? ""} is already used by another product.`,
    };
  }

  const imageFile = getImageFile(formData);
  const imageSlots = Array.from(
    new Set(
      variants
        .map((variant) => variant.imageSlot)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  let newImageUrl: string | null = representative.image_url;
  const runImageUrls = new Map<string, string>();
  const uploadedImagePaths: string[] = [];

  async function uploadEditImage(file: File, label: string) {
    const extension = getImageExtension(file);
    const path = `${business.id}/${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw new Error(`Unable to upload ${label}: ${uploadError.message}`);
    uploadedImagePaths.push(path);
    return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  try {
    if (imageFile) newImageUrl = await uploadEditImage(imageFile, "product image");
    for (const slot of imageSlots) {
      const runImageFile = getImageFile(formData, `runImage_${slot}`);
      if (!runImageFile) continue;
      runImageUrls.set(
        slot,
        await uploadEditImage(runImageFile, "colour / size-run image"),
      );
    }
  } catch (error) {
    if (uploadedImagePaths.length > 0) {
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedImagePaths);
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to upload product image.",
    };
  }

  const currentById = new Map(current.map((row) => [row.id, row]));
  const now = new Date().toISOString();

  try {
    for (const variant of variants) {
      if (variant.id) {
        const existing = currentById.get(variant.id);
        if (!existing) throw new Error("Variant was not found.");

        const updatePayload: Record<string, unknown> = {
          category_id: categoryId,
          name,
          sku: variant.sku,
          barcode:
            isGeneralShop && !supportsVariants
              ? generalBarcode ?? variant.sku
              : variant.sku,
          description,
          size: variant.size || null,
          color: variant.color || null,
          cost_price: variant.costPrice,
          selling_price: variant.sellingPrice,
          low_stock_quantity: variant.lowStockQuantity,
          is_active: variant.isActive,
          is_online: isOnline,
          updated_at: now,
        };

        const { error: updateError } = await supabase
          .from("products")
          .update(updatePayload)
          .eq("id", variant.id)
          .eq("business_id", business.id);

        if (updateError) throw new Error(updateError.message);

        const currentStock = Number(existing.stock_quantity ?? 0);
        const delta = variant.stockQuantity - currentStock;
        if (delta !== 0) {
          const { error: stockError } = await supabase.rpc("adjust_product_stock", {
            p_business_id: business.id,
            p_product_id: variant.id,
            p_quantity: delta,
            p_note: "Product edit",
          });
          if (stockError) throw new Error(stockError.message);
        }
      } else {
        if (!supportsVariants || !representative.variant_group_id) {
          throw new Error("This product does not support adding variants.");
        }

        const { error: insertError } = await supabaseAdmin
          .from("products")
          .insert({
            owner_id: userId,
            business_id: business.id,
            category_id: categoryId,
            name,
            sku: variant.sku,
            barcode: variant.sku,
            size: variant.size || null,
            color: variant.color || null,
            image_url: newImageUrl,
            variant_image_url: variant.imageSlot
              ? runImageUrls.get(variant.imageSlot) ?? null
              : null,
            description,
            cost_price: variant.costPrice,
            selling_price: variant.sellingPrice,
            stock_quantity: variant.stockQuantity,
            low_stock_quantity: variant.lowStockQuantity,
            product_type: "variant",
            variant_group_id: representative.variant_group_id,
            is_active: variant.isActive,
            is_online: isOnline,
          });

        if (insertError) throw new Error(insertError.message);
      }
    }
  } catch (error) {
    if (uploadedImagePaths.length > 0) {
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedImagePaths);
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to update product.",
    };
  }

  if (imageFile) {
    const primaryTargetIds = supportsVariants
      ? current.map((row) => row.id)
      : [representative.id];

    if (primaryTargetIds.length > 0) {
      const { error: imageUpdateError } = await supabase
        .from("products")
        .update({ image_url: newImageUrl, updated_at: now })
        .eq("business_id", business.id)
        .in("id", primaryTargetIds);

      if (imageUpdateError) {
        if (uploadedImagePaths.length > 0) {
          await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedImagePaths);
        }
        return {
          success: false,
          message: `Unable to update product image: ${imageUpdateError.message}`,
        };
      }
    }

    if (representative.image_url && representative.image_url !== newImageUrl) {
      const { data: remaining } = await supabase
        .from("products")
        .select("id")
        .eq("business_id", business.id)
        .or(`image_url.eq.${representative.image_url},variant_image_url.eq.${representative.image_url}`)
        .limit(1);

      if ((remaining ?? []).length === 0) {
        const storagePath = getStoragePathFromUrl(representative.image_url);
        if (storagePath) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([storagePath]);
      }
    }
  }

  await createAuditLog({
    action: "update",
    entityType: "product",
    entityId: representative.id,
    description: `Updated product ${name}`,
    metadata: {
      variant_group_id: representative.variant_group_id,
      variants: variants.length,
      image_changed: Boolean(imageFile),
      run_images_added: runImageUrls.size,
      is_online: isOnline,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${representative.id}/edit`);
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");
  revalidatePath("/dashboard/audit-logs");
  revalidatePath(`/_sites/${business.slug}`);

  return {
    success: true,
    message: `${name} updated successfully.`,
  };
}

async function initialProductBranch(businessId:string,form:FormData){
 const requested=getOptionalText(form,"locationId");
 const {data,error}=await supabaseAdmin.from("business_locations").select("id").eq("business_id",businessId).eq("is_active",true).order("is_default",{ascending:false}).limit(1);
 if(error)throw new Error("Unable to load product branches.");
 const id=requested||data?.[0]?.id;
 if(!id)throw new Error("Create an active branch before adding products.");
 await assertBranchOperation(businessId,id);return id;
}
async function assignCreatedProducts(businessId:string,branchId:string,ids:string[]):Promise<string>{
 try{
  const {data,error}=await supabaseAdmin.from("products").select("id,stock_quantity,low_stock_quantity").eq("business_id",businessId).in("id",ids);
  if(error||!data)throw new Error("Product stock could not be read.");
  const db=await createClient();
  const positive=data.filter(p=>Number(p.stock_quantity)>0);
  if(positive.length){const {error}=await db.rpc("tenh_pos_allocate_stock",{p_business_id:businessId,p_location_id:branchId,p_allocations:positive.map(p=>({productId:p.id,quantity:Number(p.stock_quantity)}))});if(error)throw new Error(error.message);}
  const empty=data.filter(p=>!Number(p.stock_quantity));
  if(empty.length){const {error}=await supabaseAdmin.from("product_location_stock").upsert(empty.map(p=>({business_id:businessId,location_id:branchId,product_id:p.id,quantity:0,low_stock_threshold:p.low_stock_quantity})),{onConflict:"location_id,product_id",ignoreDuplicates:true});if(error)throw new Error(error.message);}
  revalidatePath("/dashboard/inventory");return "";
 }catch{return " Product saved, but branch stock assignment failed. Use Inventory to assign its existing stock; do not create the product again.";}
}
