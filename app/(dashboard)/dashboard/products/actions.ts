"use server";

import { validateEditableVariants, MAX_EDIT_VARIANTS } from "@/lib/products/variant-editor";
import { compressPhoto } from "@/lib/images/compress-photo";
import { PUBLIC_PHOTO_CACHE_SECONDS } from "@/lib/public-photo-cache";

import { revalidatePath } from "next/cache";
import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { getCurrentBusinessMode } from "@/lib/business/get-current-business-mode";
import { createClient } from "@/lib/supabase/branch-server";
import { getBranchContext } from "@/lib/branches/context";
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

async function getImageFile(formData: FormData, key = "image"): Promise<File | null> {
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

  return compressPhoto(value);
}

async function resolveProductGallery(formData: FormData, allowed: Set<string>, upload: (file: File) => Promise<string>): Promise<string[] | null> {
  const raw = formData.get("productGallery");
  if (raw === null) return null;
  if (typeof raw !== "string") throw new Error("Invalid product gallery.");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries) || entries.length > 8) throw new Error("Use up to 8 product images.");
  const images: (string | File)[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") throw new Error("Invalid gallery image.");
    if (typeof entry.url === "string" && allowed.has(entry.url) && !entry.slot) images.push(entry.url);
    else if (typeof entry.slot === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(entry.slot) && !entry.url) {
      const file = await getImageFile(formData, `gallery_${entry.slot}`);
      if (!file) throw new Error("Choose the gallery image again.");
      images.push(file);
    } else throw new Error("Choose an existing photo from this product or upload a new image.");
  }
  const urls: string[] = [];
  for (const image of images) urls.push(typeof image === "string" ? image : await upload(image));
  return [...new Set(urls)];
}

function checkProductBarcodes(values: string[]): string | null {
  if (values.some(value => value.length > 80 || /[\x00-\x1f\x7f]/.test(value))) return "Keep barcodes within 80 printable characters.";
  const nonEmpty = values.filter(Boolean);
  return new Set(nonEmpty).size === nonEmpty.length ? null : "Each variant must use a different barcode.";
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


export type CreateProductState = {
  success: boolean;
  message: string;
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

  const barcodeInput = getOptionalText(formData, "barcode");
  const barcode = barcodeInput ?? sku;
  const barcodeError = checkProductBarcodes([barcode]);
  if (barcodeError) return { success: false, message: barcodeError };
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

  const imageFile = await getImageFile(formData);

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
    .from("branch_products")
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

  if (barcode) {
    const { data: existingBarcode, error: barcodeCheckError } = await supabase
      .from("branch_products")
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
            cacheControl: PUBLIC_PHOTO_CACHE_SECONDS,
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

  const galleryPaths: string[] = [];
  let gallery: string[] | null = null;
  try {
    gallery = await resolveProductGallery(formData, new Set(), async file => {
      const path = `${business.id}/${user.id}/${crypto.randomUUID()}.${getImageExtension(file)}`;
      const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: PUBLIC_PHOTO_CACHE_SECONDS, upsert: false });
      if (error) throw new Error(error.message);
      galleryPaths.push(path);
      return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    });
    if (gallery !== null) imageUrl = gallery[0] ?? null;
  } catch (error) {
    if (uploadedImagePath) galleryPaths.push(uploadedImagePath);
    if (galleryPaths.length) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(galleryPaths);
    return { success: false, message: error instanceof Error ? error.message : "Unable to save gallery." };
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
        ...(gallery !== null ? { image_urls: gallery } : {}),
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
    if (galleryPaths.length) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(galleryPaths);
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
      .from("branch_products")
      .select("id, name, is_active")
      .eq("id", productId)
      .eq("business_id", business.id)
      .single();

  if (productError || !product) {
    throw new Error(productError?.message);
  }

  const newStatus = !product.is_active;

  const { error } = await supabase
    .from("branch_products")
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

  const imageFile = await getImageFile(formData);

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
    .from("branch_products")
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
      .from("branch_products")
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
            cacheControl: PUBLIC_PHOTO_CACHE_SECONDS,
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
    .from("branch_products")
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
export async function adjustStock(formData: FormData) {
  await requirePermission("products.stock_adjust");
  const id = getOptionalText(formData, "productId");
  redirect(`/dashboard/inventory/adjustments${id ? `?product=${encodeURIComponent(id)}` : ""}`);
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
    .from("branch_products")
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
    .from("branch_products")
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
  revalidatePath("/dashboard/settings/online-store");
  revalidatePath(`/_sites/${business.slug}`);
}


export type ProductRowActionResult = {
  remainingProductId?: string;
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
    .from("branch_products")
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
      .from("branch_products")
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
    .from("branch_products")
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
  revalidatePath("/dashboard/settings/online-store");
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
    .from("branch_products")
    .select("id, name, product_type, variant_group_id")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (productError || !product) {
    return { success: false, message: productError?.message ?? "Product was not found." };
  }

  let query = supabase.from("branch_products").select("id").eq("business_id", business.id);
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
    .from("branch_products")
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
  revalidatePath("/dashboard/settings/online-store");
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
  expectedBranchId?: string,
): Promise<ProductRowActionResult> {
  const business = await requirePermission("products.disable");
  if (expectedBranchId && (await getBranchContext()).branchId !== expectedBranchId) return { success: false, message: "Your branch changed. Reload before changing visibility." };
  const uniqueIds = Array.from(new Set(variantIds.filter(Boolean)));
  if (!productId || uniqueIds.length === 0) {
    return { success: false, message: "Select at least one variant." };
  }

  const supabase = await createClient();
  const { data: representative, error: representativeError } = await supabase
    .from("branch_products")
    .select("id, name, product_type, variant_group_id")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (representativeError || !representative) {
    return { success: false, message: representativeError?.message ?? "Product was not found." };
  }

  let groupQuery = supabase.from("branch_products").select("id").eq("business_id", business.id);
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
    .from("branch_products")
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
  revalidatePath("/dashboard/settings/online-store");
  revalidatePath(`/_sites/${business.slug}`);
  return {
    success: true,
    message: active ? `${uniqueIds.length} variants activated.` : `${uniqueIds.length} variants hidden.`,
  };
}

export async function deleteProductVariants(
  productId: string,
  variantIds: string[],
  expectedBranchId?: string,
  allowWholeProduct = false,
): Promise<ProductRowActionResult> {
  const business = await requirePermission("products.disable");
  if (expectedBranchId && (await getBranchContext()).branchId !== expectedBranchId) {
    return { success: false, message: "Your branch changed. Reload before removing variants." };
  }
  const uniqueIds = Array.from(new Set(variantIds.filter(Boolean)));
  if (!productId || uniqueIds.length === 0) {
    return { success: false, message: "Select at least one variant." };
  }

  const supabase = await createClient();
  const { data: representative, error: representativeError } = await supabase
    .from("branch_products")
    .select("id, name, product_type, variant_group_id")
    .eq("id", productId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (representativeError || !representative) {
    return { success: false, message: representativeError?.message ?? "Product was not found." };
  }

  let groupQuery = supabase
    .from("branch_products")
    .select("id, image_url, variant_image_url, stock_quantity")
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
  if (!allowWholeProduct && rows.length - uniqueIds.length < 1) {
    return { success: false, message: "Keep at least one variant. Use Delete Product to remove the whole style." };
  }

  // The database clears current-branch stock and archives the rows atomically.

  const { error: deleteError } = await supabase
    .from("branch_products")
    .delete()
    .eq("business_id", business.id)
    .in("id", uniqueIds);
  if (deleteError) {
    if (deleteError.code === "23503") {
      return { success: false, message: "One or more selected variants are already used in sales, purchases, bundles, or inventory history. Hide them instead." };
    }
    return { success: false, message: deleteError.message };
  }


  try {
  await createAuditLog({
    action: "delete",
    entityType: "product",
    entityId: representative.id,
    description: `Deleted ${uniqueIds.length} variants from ${representative.name}`,
    metadata: { variant_ids: uniqueIds },
  });

  } catch { /* The database deletion and stock ledger have already committed. */ }

  try {
  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${representative.id}/edit`);
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/adjustments");
  revalidatePath("/dashboard/low-stock");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/settings/online-store");
  revalidatePath(`/_sites/${business.slug}`);
  } catch { /* Do not report a committed deletion as failed on cache errors. */ }
  return { success: true, message: `${uniqueIds.length} variants removed from this branch. Remaining stock was cleared; history is kept.`, remainingProductId: rows.find((row) => !uniqueIds.includes(row.id))?.id };
}

export async function deleteProductGroup(
  productId: string,
  expectedBranchId?: string,
): Promise<ProductRowActionResult> {
  const business = await requirePermission("products.disable");
  if (expectedBranchId && (await getBranchContext()).branchId !== expectedBranchId) {
    return { success: false, message: "Your branch changed. Reload before removing the product." };
  }

  if (!productId) {
    return { success: false, message: "Invalid product ID." };
  }

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("branch_products")
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
    .from("branch_products")
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

  const { error: deleteError } = await supabase
    .from("branch_products")
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


  try {
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

  } catch { /* The database deletion and stock ledger have already committed. */ }

  try {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/adjustments");
  revalidatePath("/dashboard/low-stock");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/settings/online-store");
  revalidatePath("/dashboard/audit-logs");
  revalidatePath(`/_sites/${business.slug}`);

  } catch { /* Do not report a committed deletion as failed on cache errors. */ }
  return {
    success: true,
    message: `${product.name} removed from this branch. Remaining stock was cleared; history is kept.`,
  };
}


// ---------------------------------------------------------------------------
// Variant products
// Each exact size/color SKU remains a normal products row so existing POS,
// inventory, bundle and reporting code keeps working. variant_group_id groups
// those rows into one public-store product card.
// ---------------------------------------------------------------------------
type VariantInput = {
  barcode: string;
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
      const barcode = typeof source.barcode === "string" ? source.barcode.trim() : sku;
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
          barcode,
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

  const barcodeError = checkProductBarcodes(variants.map(variant => variant.barcode || variant.sku));
  if (barcodeError) return { success: false, message: barcodeError };
  const barcodeCheck = await supabaseAdmin.from("products").select("id").eq("business_id", business.id).in("barcode", variants.map(variant => variant.barcode || variant.sku)).limit(1);
  if (barcodeCheck.error || barcodeCheck.data?.length) return { success: false, message: barcodeCheck.error?.message ?? "A barcode is already used by another product." };
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

  const imageFile = await getImageFile(formData);
  const imageSlots = Array.from(
    new Set(
      variants
        .map((variant) => variant.imageSlot)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  let imageUrl: string | null = null;
  let gallery: string[] | null = null;
  const runImageUrls = new Map<string, string>();
  const uploadedImagePaths: string[] = [];

  async function uploadVariantImage(file: File, label: string) {
    const extension = getImageExtension(file);
    const path = `${business.id}/${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: PUBLIC_PHOTO_CACHE_SECONDS,
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
      const runImageFile = await getImageFile(formData, `runImage_${slot}`);
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

  try {
    gallery = await resolveProductGallery(formData, new Set(), file => uploadVariantImage(file, "gallery image"));
    if (gallery !== null) imageUrl = gallery[0] ?? null;
  } catch (error) {
    if (uploadedImagePaths.length) await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedImagePaths);
    return { success: false, message: error instanceof Error ? error.message : "Unable to save gallery." };
  }
  const variantGroupId = crypto.randomUUID();
  const rows = variants.map((variant) => ({
    owner_id: userId,
    business_id: business.id,
    category_id: categoryId,
    name,
    sku: variant.sku,
    barcode: variant.barcode || variant.sku,
    size: variant.size || null,
    color: variant.color || null,
    image_url: imageUrl,
    ...(gallery !== null ? { image_urls: gallery } : {}),
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
  revalidatePath("/dashboard/settings/online-store");

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

  const imageFile = await getImageFile(formData);
  let imageUrl: string | null = null;
  let uploadedImagePath: string | null = null;

  if (imageFile) {
    const extension = getImageExtension(imageFile);
    uploadedImagePath = `${business.id}/${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(uploadedImagePath, imageFile, {
        contentType: imageFile.type,
        cacheControl: PUBLIC_PHOTO_CACHE_SECONDS,
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
  revalidatePath("/dashboard/settings/online-store");

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
  refreshRequired?: boolean;
};

type EditVariantInput = {
  barcode?: string;
  id: string | null;
  size: string; color: string; sku: string;
  costPrice: number; sellingPrice: number; stockQuantity: number; lowStockQuantity: number;
  isActive: boolean;
  isOnline?: boolean;
  imageSlot: string | null;
  imageAction: "keep" | "remove" | "existing" | "upload";
  variantImageUrl: string | null;
  expectedUpdatedAt: string | null;
};

// Reject the entire payload if any row is malformed. Never silently drop rows.
function parseEditVariants(value: FormDataEntryValue | null): EditVariantInput[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_EDIT_VARIANTS) return [];
    const rows: EditVariantInput[] = [];
    const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
    const number = (value: unknown) => (typeof value === "number" || (typeof value === "string" && value.trim())) ? Number(value) : NaN;
    for (const value of parsed) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const source = value as Record<string, unknown>;
      const imageSlot = text(source.imageSlot) || null;
      const action = source.imageAction ?? (imageSlot ? "upload" : "keep");
      if (!["keep", "remove", "existing", "upload"].includes(String(action))) return [];
      if (imageSlot && !/^[a-zA-Z0-9_-]{1,80}$/.test(imageSlot)) return [];
      if (typeof source.isActive !== "boolean") return [];
      if (source.isOnline !== undefined && typeof source.isOnline !== "boolean") return [];
      const row: EditVariantInput = {
        id: text(source.id) || null, size: text(source.size), color: text(source.color), sku: text(source.sku),
      barcode: typeof source.barcode === "string" ? source.barcode.trim() : undefined,
        costPrice: number(source.costPrice), sellingPrice: number(source.sellingPrice),
        stockQuantity: number(source.stockQuantity), lowStockQuantity: number(source.lowStockQuantity),
        isActive: source.isActive, isOnline: source.isOnline as boolean | undefined, imageSlot, imageAction: action as EditVariantInput["imageAction"],
        variantImageUrl: text(source.variantImageUrl) || null,
        expectedUpdatedAt: text(source.expectedUpdatedAt) || null,
      };
      if (validateEditableVariants([row], false)) return [];
      rows.push(row);
    }
    return rows;
  } catch { return []; }
}

export async function updateProductGroup(
  previousState: UpdateProductGroupState,
  formData: FormData,
): Promise<UpdateProductGroupState> {
  try {
    return await saveEditedProductGroup(previousState, formData);
  } catch (error) {
    // A transport, authorization or post-write failure has an uncertain outcome.
    // Force a fresh read instead of inviting duplicate new-variant submissions.
    return { success: false, refreshRequired: true, message: `${error instanceof Error ? error.message : "Unable to save the product."} Reload the product to review its current state before retrying.` };
  }
}

async function saveEditedProductGroup(
  _previousState: UpdateProductGroupState,
  formData: FormData,
): Promise<UpdateProductGroupState> {
  const business = await requirePermission("products.update");
  const context = await getBranchContext();
  const expectedBranch = getOptionalText(formData, "branchId");
  if (context.business.id !== business.id || (expectedBranch && expectedBranch !== context.branchId)) {
    return { success: false, refreshRequired: true, message: "Your operating branch changed. Reload this product before saving." };
  }
  const currentBusinessMode = await getCurrentBusinessMode({ businessId: business.id, productMode: business.productMode });
  const isGeneralShop = currentBusinessMode.value === "general";
  const productId = getOptionalText(formData, "productId");
  const name = getOptionalText(formData, "name") ?? "";
  const categoryId = getOptionalText(formData, "categoryId");
  const description = getOptionalText(formData, "description");
  const isOnline = formData.get("isOnline") === "true";
  const variants = parseEditVariants(formData.get("variants"));
  const fail = (message: string): UpdateProductGroupState => ({ success: false, message });
  if (!productId) return fail("Invalid product ID.");
  if (name.length < 2 || name.length > 160) return fail("Enter a product name with 2–160 characters.");
  if (!variants.length) return fail("Every variant needs a SKU, valid prices and whole-number initial stock / low-stock values. No changes were saved.");
  const validation = validateEditableVariants(variants, false);
  if (validation) return fail(validation);
  await assertCategoryBelongsToBusiness(business.id, categoryId);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again.");
  const userId = user.id;
  const { data: representative, error: representativeError } = await supabase.from("branch_products")
    .select("id, name, product_type, variant_group_id, image_url, is_online")
    .eq("id", productId).eq("business_id", business.id).maybeSingle();
  if (representativeError || !representative) return fail(representativeError?.message ?? "Product was not found.");
  const supportsVariants = representative.product_type === "variant" && Boolean(representative.variant_group_id);
  let currentQuery = supabase.from("branch_products")
    .select("id, sku, barcode, stock_quantity, image_url, image_urls, variant_image_url, updated_at, is_active")
    .eq("business_id", business.id);
  currentQuery = supportsVariants ? currentQuery.eq("variant_group_id", representative.variant_group_id) : currentQuery.eq("id", representative.id);
  const { data: currentRows, error: currentError } = await currentQuery;
  if (currentError) return fail(currentError.message);
  const current = (currentRows ?? []) as Array<{
    id: string; sku: string | null; stock_quantity: number;
    image_url: string | null; image_urls?: string[]; barcode?: string | null; variant_image_url: string | null;
    updated_at: string; is_active: boolean;
  }>;
  const currentById = new Map(current.map(row => [row.id, row] as const));
  const submittedIds = variants.flatMap(row => row.id ? [row.id] : []);
  if (submittedIds.some(id => !currentById.has(id))) return fail("One of these variants no longer belongs to this product. Reload before saving.");
  if (submittedIds.length !== current.length) return fail("The variant list changed or a saved row is missing. Reload before saving; use the separate Remove action to remove variants.");
  if (!supportsVariants && (variants.length !== 1 || variants[0].id !== representative.id)) return fail("This product does not support multiple variants.");
  if (variants.some(row => !row.id)) await requirePermission("products.create");
  if (variants.some(row => row.id && currentById.get(row.id)?.is_active !== row.isActive)) await requirePermission("products.disable");
  const optionsError = validateEditableVariants(variants, supportsVariants);
  if (optionsError) return fail(optionsError);
  if (variants.some(row => row.id && row.expectedUpdatedAt && currentById.get(row.id)?.updated_at !== row.expectedUpdatedAt)) {
    return { ...fail("Another user changed this product. Reload and review their changes before saving."), refreshRequired: true };
  }
  const generalBarcode = isGeneralShop && !supportsVariants ? getOptionalText(formData, "barcode") ?? variants[0].sku : null;
  if (generalBarcode) {
    const { data, error } = await supabase.from("branch_products").select("id").eq("business_id", business.id).eq("barcode", generalBarcode).neq("id", representative.id).limit(1);
    if (error) return fail(error.message);
    if (data?.length) return fail("This barcode is already used by another product in this branch.");
  }
  const { data: duplicates, error: duplicateError } = await supabase.from("branch_products").select("id, sku")
    .eq("business_id", business.id).in("sku", variants.map(row => row.sku));
  if (duplicateError) return fail(duplicateError.message);
  const externalDuplicate = (duplicates ?? []).find(row => !currentById.has(row.id));
  if (externalDuplicate) return fail(`SKU ${externalDuplicate.sku ?? ""} is already used by another product.`);

  const barcodes = variants.map(row => row.barcode === undefined ? (currentById.get(row.id ?? "")?.barcode ?? row.sku) : row.barcode || row.sku);
  const barcodeError = checkProductBarcodes(barcodes);
  if (barcodeError) return fail(barcodeError);
  const barcodeCheck = await supabase.from("branch_products").select("id,barcode").eq("business_id", business.id).in("barcode", barcodes);
  if (barcodeCheck.error) return fail(barcodeCheck.error.message);
  if (barcodeCheck.data?.some(row => !currentById.has(row.id))) return fail("A barcode is already used by another product in this branch.");

  const allowedImages = new Set<string>(current.flatMap(row => [row.image_url, row.variant_image_url, ...(row.image_urls ?? [])]).filter((url): url is string => Boolean(url)));
  const mainAction = getOptionalText(formData, "mainImageAction") ?? "keep";
  const mainExistingUrl = getOptionalText(formData, "mainImageUrl");
  const mainSlot = getOptionalText(formData, "mainImageSlot");
  if (!["keep", "remove", "existing", "upload"].includes(mainAction)) return fail("Invalid main image action.");
  if (mainAction === "existing" && (!mainExistingUrl || !allowedImages.has(mainExistingUrl))) return fail("Choose an existing image from this product, or upload a new one.");
  if (mainAction === "upload" && (!mainSlot || !/^[a-zA-Z0-9_-]{1,80}$/.test(mainSlot))) return fail("Choose the main image again.");
  for (const row of variants) {
    if (row.imageAction === "existing" && (!row.variantImageUrl || !allowedImages.has(row.variantImageUrl))) return fail("A variant image is not part of this product. Choose it again.");
    if (row.imageAction === "upload" && !row.imageSlot) return fail("Choose the variant image again.");
  }
  const slots = new Set(variants.filter(row => row.imageAction === "upload").map(row => row.imageSlot!));
  if (mainAction === "upload") slots.add(mainSlot!);
  // Validate every upload before writing files or product rows.
  const imageFiles = new Map<string, File>();
  let legacyMain: File | null = null;
  try {
    legacyMain = await getImageFile(formData);
    for (const slot of slots) {
      const image = await getImageFile(formData, `runImage_${slot}`);
      if (!image) return fail("An image upload is missing. Choose that image again; no product changes were saved.");
      imageFiles.set(slot, image);
    }
  } catch (error) { return fail(error instanceof Error ? error.message : "Invalid image upload."); }
  const uploadedPaths: string[] = [], uploadedUrls = new Map<string, string>();
  let gallery: string[] | null = null;
  let newImageUrl: string | null = mainAction === "remove" ? null : mainAction === "existing" ? mainExistingUrl : representative.image_url;
  async function upload(file: File): Promise<string> {
    const path = `${business.id}/${userId}/${crypto.randomUUID()}.${getImageExtension(file)}`;
    const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: PUBLIC_PHOTO_CACHE_SECONDS, upsert: false });
    if (error) throw new Error(`Unable to upload image: ${error.message}`);
    uploadedPaths.push(path);
    return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  try {
    if (legacyMain) newImageUrl = await upload(legacyMain);
    for (const [slot, file] of imageFiles) uploadedUrls.set(slot, await upload(file));
    if (mainAction === "upload") newImageUrl = uploadedUrls.get(mainSlot!)!;
    gallery = await resolveProductGallery(formData, allowedImages, async file => {
      const path = `${business.id}/${userId}/${crypto.randomUUID()}.${getImageExtension(file)}`;
      const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: PUBLIC_PHOTO_CACHE_SECONDS, upsert: false });
      if (error) throw new Error(error.message);
      uploadedPaths.push(path);
      return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    });
  } catch (error) {
    // Nothing has referenced these new uploads yet. Existing files are never removed.
    if (uploadedPaths.length) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedPaths);
    return fail(error instanceof Error ? error.message : "Unable to upload images.");
  }
  if (gallery !== null) newImageUrl = gallery[0] ?? null;
  const imageChanged = gallery !== null || mainAction !== "keep" || Boolean(legacyMain);
  const now = new Date().toISOString();
  try {
    for (const variant of variants) {
      const existing = variant.id ? currentById.get(variant.id) : null;
      const variantImage = variant.imageAction === "remove" ? null
        : variant.imageAction === "existing" ? variant.variantImageUrl
        : variant.imageAction === "upload" ? uploadedUrls.get(variant.imageSlot!)!
        : existing?.variant_image_url ?? null;
      if (variant.id) {
        const payload: Record<string, unknown> = {
          category_id: categoryId, name, sku: variant.sku, barcode: generalBarcode ?? (variant.barcode === undefined ? existing?.barcode ?? variant.sku : variant.barcode || variant.sku),
          description, size: variant.size || null, color: variant.color || null,
          cost_price: variant.costPrice, selling_price: variant.sellingPrice,
          low_stock_quantity: variant.lowStockQuantity, is_active: variant.isActive,
          is_online: (variant.isOnline ?? isOnline) && variant.isActive, updated_at: now,
        };
        if (imageChanged) payload.image_url = newImageUrl;
        if (gallery !== null) payload.image_urls = gallery;
        if (variant.imageAction !== "keep") payload.variant_image_url = variantImage;
        // No stock_quantity update: the inventory workflow owns saved stock.
        let query = supabase.from("branch_products").update(payload).eq("id", variant.id).eq("business_id", business.id);
        if (variant.expectedUpdatedAt) query = query.eq("updated_at", variant.expectedUpdatedAt);
        const { data: updated, error } = await query.select("id");
        if (error) throw new Error(error.message);
        if (!updated?.length) throw new Error("A variant changed while saving. Reload to review its latest values.");
        if (gallery !== null) {
          // Storefront reads the shared catalog; only explicit gallery edits change its media.
          const { error: mediaError } = await supabaseAdmin.from("products").update({ image_url: newImageUrl, image_urls: gallery }).eq("business_id", business.id).eq("id", variant.id);
          if (mediaError) throw new Error(mediaError.message);
        }
      } else {
        if (!supportsVariants) throw new Error("This product does not support adding variants.");
        const { data: created, error } = await supabaseAdmin.from("products").insert({
          owner_id: userId, business_id: business.id, category_id: categoryId, name,
          sku: variant.sku, barcode: variant.sku, size: variant.size, color: variant.color,
          image_url: newImageUrl, image_urls: gallery ?? current[0]?.image_urls ?? [], variant_image_url: variantImage, description,
          cost_price: variant.costPrice, selling_price: variant.sellingPrice,
          stock_quantity: variant.stockQuantity, low_stock_quantity: variant.lowStockQuantity,
          product_type: "variant", variant_group_id: representative.variant_group_id,
          is_active: variant.isActive, is_online: (variant.isOnline ?? isOnline) && variant.isActive,
        }).select("id").single();
        if (error || !created) throw new Error(error?.message ?? "Unable to add variant.");
        const assignment = await assignCreatedProducts(business.id, context.branchId, [created.id]);
        if (assignment) throw new Error(assignment);
      }
    }
  } catch (error) {
    // The existing branch API is multi-request, not an atomic transaction.
    // Keep possibly committed uploads and block blind retries of new rows.
    return { success: false, refreshRequired: true, message: `${error instanceof Error ? error.message : "Save was interrupted."} Some rows may already be saved. Reload and review before retrying.` };
  }
  await createAuditLog({ action: "update", entityType: "product", entityId: representative.id,
    description: `Updated product ${name}`, metadata: { variant_group_id: representative.variant_group_id,
      variants: variants.length, image_changed: imageChanged, variant_images_changed: variants.filter(row => row.imageAction !== "keep").length,
      run_images_added: uploadedUrls.size, is_online: isOnline } });
  for (const path of ["/dashboard", "/dashboard/products", `/dashboard/products/${representative.id}/edit`, "/dashboard/inventory", "/dashboard/pos", "/dashboard/settings/online-store", "/dashboard/audit-logs", `/_sites/${business.slug}`]) revalidatePath(path);
  return { success: true, message: `${name} updated successfully.` };
}

async function initialProductBranch(businessId:string,form:FormData){
 const context=await getBranchContext();
 if(context.business.id!==businessId)throw new Error("The business changed. Reload this page.");
 const requested=getOptionalText(form,"locationId");
 if(requested && requested!==context.branchId)throw new Error("Switch the workspace branch before adding products there.");
 await assertBranchOperation(businessId,context.branchId);return context.branchId;
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
