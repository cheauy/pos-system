"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/require-permission";
import type { ProductMode } from "@/lib/business/types";
import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import {
  getTenantDashboardUrl,
  isValidTenantSlug,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

const productModes: ProductMode[] = [
  "standard",
  "variant",
  "configurable",
];

function isProductMode(
  value: string,
): value is ProductMode {
  return productModes.includes(
    value as ProductMode,
  );
}

export async function updateProductMode(
  formData: FormData,
) {
  const business = await requirePermission(
    "business.product_mode.update",
  );

  // Extra protection
  if (business.role !== "owner") {
    throw new Error(
      "Only the business owner can change product type.",
    );
  }

  const productMode =
    formData.get("productMode");

  if (
    typeof productMode !== "string" ||
    !isProductMode(productMode)
  ) {
    throw new Error(
      "Please select a valid product type.",
    );
  }

  const { data: storefront } = await supabaseAdmin
    .from("business_storefronts")
    .select("business_type")
    .eq("business_id", business.id)
    .maybeSingle();

  const preset = storefront?.business_type
    ? getBusinessModePreset(storefront.business_type)
    : null;

  if (
    preset &&
    storefront?.business_type !== "other" &&
    productMode !== preset.productMode
  ) {
    throw new Error(
      `This business type uses ${preset.productHint}. Change the business type in Settings / Online Store to change the product workflow safely.`,
    );
  }

  const { error } = await supabaseAdmin
    .from("businesses")
    .update({
      product_mode: productMode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", business.id);

  if (error) {
    throw new Error(
      `Unable to update product type: ${error.message}`,
    );
  }

  await createAuditLog({
    action: "update",
    entityType: "user",
    entityId: business.id,
    description:
      `Changed product type from ${business.productMode} to ${productMode}`,
    metadata: {
      business_id: business.id,
      old_product_mode:
        business.productMode,
      new_product_mode: productMode,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath(
    "/dashboard/settings/users",
  );
}

export async function updateStoreAddress(
  formData: FormData,
) {
  const business = await requirePermission(
    "business.update",
  );

  if (business.role !== "owner") {
    throw new Error(
      "Only the business owner can change the store address.",
    );
  }

  const rawSubdomain = formData.get("subdomain");

  if (typeof rawSubdomain !== "string") {
    throw new Error("Store address is required.");
  }

  const subdomain = normalizeTenantSlug(
    rawSubdomain,
  );

  if (
    !isValidTenantSlug(subdomain) ||
    subdomain.length > 40 ||
    subdomain !== rawSubdomain.trim().toLowerCase()
  ) {
    throw new Error(
      "Use 2–40 lowercase letters, numbers or hyphens. Reserved TENH addresses cannot be used.",
    );
  }

  if (subdomain === business.slug) {
    redirect(
      getTenantDashboardUrl(
        business.slug,
        "/dashboard/settings/business",
      ),
    );
  }

  const {
    data: existingBusiness,
    error: existingError,
  } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .ilike("slug", subdomain)
    .neq("id", business.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Unable to check store address: ${existingError.message}`,
    );
  }

  if (existingBusiness) {
    throw new Error(
      "This TENH POS store address is already in use.",
    );
  }

  const { error } = await supabaseAdmin
    .from("businesses")
    .update({
      slug: subdomain,
      updated_at: new Date().toISOString(),
    })
    .eq("id", business.id);

  if (error) {
    throw new Error(
      `Unable to update store address: ${error.message}`,
    );
  }

  await createAuditLog({
    action: "update",
    entityType: "user",
    entityId: business.id,
    description: `Changed store address from ${business.slug} to ${subdomain}`,
    metadata: {
      old_slug: business.slug,
      new_slug: subdomain,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/business");

  redirect(
    getTenantDashboardUrl(
      subdomain,
      "/dashboard/settings/business",
    ),
  );
}
