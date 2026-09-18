"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/require-permission";
import type { ProductMode } from "@/lib/business/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { getAppUrl } from "@/lib/tenancy/domain";
import { getStoreSlugAvailability } from "@/lib/tenancy/store-slug-availability";

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

  const availability = await getStoreSlugAvailability(
    rawSubdomain,
    { excludeBusinessId: business.id },
  );
  const subdomain = availability.slug;

  if (
    availability.status === "invalid" ||
    availability.status === "reserved"
  ) {
    throw new Error(
      "Use 2–40 lowercase letters, numbers or hyphens. Reserved TENH addresses cannot be used.",
    );
  }

  if (subdomain === business.slug) {
    redirect(getAppUrl("/dashboard/settings/business"));
  }

  if (availability.status === "already_taken") {
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
    if (error.code === "23505") {
      throw new Error(
        "This TENH POS store address is already in use.",
      );
    }

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

  redirect(getAppUrl("/dashboard/settings/business"));
}
