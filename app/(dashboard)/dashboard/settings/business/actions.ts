"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/require-permission";
import type { ProductMode } from "@/lib/business/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditLog } from "@/lib/audit/create-audit-log";

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