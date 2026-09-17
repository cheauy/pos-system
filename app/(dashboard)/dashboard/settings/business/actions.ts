"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/require-permission";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import type { ProductMode } from "@/lib/business/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isValidTenantSlug,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

const CHANGE_PRICE_USD = 5;
const BUSINESS_CHANGE_PROOF_BUCKET = "tenh-pos-business-change-proofs";
const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export type StoreAddressAvailabilityResult = {
  slug: string;
  available: boolean;
  status: "available" | "current" | "invalid" | "taken" | "error";
  message: string;
};

export async function checkStoreAddressAvailability(
  rawSubdomain: string,
): Promise<StoreAddressAvailabilityResult> {
  const business = await requirePermission("business.update");

  if (business.role !== "owner") {
    return {
      slug: "",
      available: false,
      status: "error",
      message: "Only the business owner can check and change the store address.",
    };
  }

  const subdomain = normalizeTenantSlug(rawSubdomain);

  if (
    !isValidTenantSlug(subdomain) ||
    subdomain.length > 40 ||
    subdomain !== rawSubdomain.trim().toLowerCase()
  ) {
    return {
      slug: subdomain,
      available: false,
      status: "invalid",
      message:
        "Use 2–40 lowercase letters, numbers or hyphens. Reserved TENH addresses cannot be used.",
    };
  }

  if (subdomain === business.slug) {
    return {
      slug: subdomain,
      available: true,
      status: "current",
      message: "This is your current TENH POS address.",
    };
  }

  const { data: existingBusiness, error } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .ilike("slug", subdomain)
    .neq("id", business.id)
    .maybeSingle();

  if (error) {
    return {
      slug: subdomain,
      available: false,
      status: "error",
      message: "TENH could not check this address right now. Please try again.",
    };
  }

  if (existingBusiness) {
    return {
      slug: subdomain,
      available: false,
      status: "taken",
      message: "This TENH POS address is already in use. Try another one.",
    };
  }

  return {
    slug: subdomain,
    available: true,
    status: "available",
    message: "Available — you can continue with this store address.",
  };
}

function proofExtension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

function safeProofFileName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return cleaned || "payment-proof";
}

function inferBusinessType(productMode: ProductMode) {
  if (productMode === "variant") return "fashion";
  if (productMode === "configurable") return "milk_tea";
  return "general";
}

async function getCurrentBusinessType(
  businessId: string,
  productMode: ProductMode,
) {
  const { data: storefront, error } = await supabaseAdmin
    .from("business_storefronts")
    .select("business_type")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load the current business mode: ${error.message}`);
  }

  const stored = storefront?.business_type ?? "";
  return getBusinessModePreset(stored)?.value ?? inferBusinessType(productMode);
}

async function createChangeOrderForRequestedState({
  rawSubdomain,
  requestedBusinessMode,
}: {
  rawSubdomain: string;
  requestedBusinessMode: string;
}) {
  const business = await requirePermission("business.update");

  if (business.role !== "owner") {
    throw new Error("Only the business owner can request paid business changes.");
  }

  const subdomain = normalizeTenantSlug(rawSubdomain);

  if (
    !isValidTenantSlug(subdomain) ||
    subdomain.length > 40 ||
    subdomain !== rawSubdomain.trim().toLowerCase()
  ) {
    throw new Error(
      "Use 2–40 lowercase letters, numbers or hyphens. Reserved TENH addresses cannot be used.",
    );
  }

  const preset = getBusinessModePreset(requestedBusinessMode);

  if (!preset) {
    throw new Error("Please select a valid business type.");
  }

  const currentBusinessType = await getCurrentBusinessType(
    business.id,
    business.productMode,
  );

  const changeUrl = subdomain !== business.slug;
  const changeBusinessMode = requestedBusinessMode !== currentBusinessType;

  if (!changeUrl && !changeBusinessMode) {
    throw new Error("There are no changes to continue with.");
  }

  if (changeUrl) {
    const { data: existingBusiness, error: existingError } = await supabaseAdmin
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
      throw new Error("This TENH POS store address is already in use.");
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const { data: result, error: orderError } = await supabaseAdmin.rpc(
    "create_business_change_order_with_entitlement",
    {
      p_business_id: business.id,
      p_requesting_user_id: user.id,
      p_old_slug: business.slug,
      p_requested_slug: subdomain,
      p_old_business_type: currentBusinessType,
      p_requested_business_type: preset.value,
      p_old_product_mode: business.productMode,
      p_requested_product_mode: preset.productMode,
      p_change_url: changeUrl,
      p_change_business_mode: changeBusinessMode,
    },
  );

  if (orderError) {
    throw new Error(`Unable to create the change order: ${orderError.message}`);
  }

  const order = Array.isArray(result) ? result[0] : result;

  if (!order?.order_id) {
    throw new Error("Unable to create the business change order.");
  }

  const totalAmount = Number(order.total_amount ?? 0);
  const includedUrlChange = Boolean(order.included_url_change);
  const includedBusinessModeChange = Boolean(
    order.included_business_mode_change,
  );

  await createAuditLog({
    action: "create",
    entityType: "business",
    entityId: business.id,
    description:
      totalAmount === 0
        ? "Applied subscription-included business changes"
        : `Created business change order for $${totalAmount.toFixed(2)}`,
    metadata: {
      change_order_id: order.order_id,
      old_slug: business.slug,
      requested_slug: subdomain,
      old_business_type: currentBusinessType,
      requested_business_type: preset.value,
      change_url: changeUrl,
      change_business_mode: changeBusinessMode,
      included_url_change: includedUrlChange,
      included_business_mode_change: includedBusinessModeChange,
      total_amount: totalAmount,
      currency: "USD",
    },
  });

  if (order.order_status === "applied") {
    revalidatePath("/dashboard/settings/business");
    revalidatePath("/dashboard/settings");
    redirect("/dashboard/settings/business?included=1");
  }

  redirect(`/dashboard/settings/business/payment/${order.order_id}`);
}

export async function createBusinessChangeOrder(formData: FormData) {
  const rawSubdomain = formData.get("subdomain");
  const requestedBusinessMode = formData.get("businessMode");

  if (typeof rawSubdomain !== "string") {
    throw new Error("Store address is required.");
  }

  if (typeof requestedBusinessMode !== "string") {
    throw new Error("Please select a valid business type.");
  }

  await createChangeOrderForRequestedState({
    rawSubdomain,
    requestedBusinessMode,
  });
}

// Compatibility guard for an older product-mode form that may still exist in
// the repository. It is intentionally no longer allowed to change the engine
// for free; owners must use the paid Business Settings flow instead.
export async function updateProductMode() {
  redirect("/dashboard/settings/business");
}

// Compatibility actions keep old cached/settings forms from bypassing the fee.
// They now create a paid change order instead of applying a free mutation.
export async function updateStoreAddress(formData: FormData) {
  const business = await requirePermission("business.update");
  const rawSubdomain = formData.get("subdomain");

  if (typeof rawSubdomain !== "string") {
    throw new Error("Store address is required.");
  }

  const currentBusinessType = await getCurrentBusinessType(
    business.id,
    business.productMode,
  );

  await createChangeOrderForRequestedState({
    rawSubdomain,
    requestedBusinessMode: currentBusinessType,
  });
}

export async function updateBusinessMode(formData: FormData) {
  const business = await requirePermission("business.product_mode.update");
  const requestedBusinessMode = formData.get("businessMode");

  if (typeof requestedBusinessMode !== "string") {
    throw new Error("Please select a valid business type.");
  }

  await createChangeOrderForRequestedState({
    rawSubdomain: business.slug,
    requestedBusinessMode,
  });
}

export async function submitBusinessChangePaymentReference(formData: FormData) {
  const business = await requirePermission("business.update");

  if (business.role !== "owner") {
    throw new Error("Only the business owner can submit payment details.");
  }

  const orderId = formData.get("orderId");
  const paymentReference = formData.get("paymentReference");
  const paymentNote = formData.get("paymentNote");
  const proofValue = formData.get("paymentProof");
  const proofFile =
    proofValue instanceof File && proofValue.size > 0 ? proofValue : null;

  if (typeof orderId !== "string" || !orderId) {
    throw new Error("Change order is required.");
  }

  if (
    typeof paymentReference !== "string" ||
    paymentReference.trim().length < 2 ||
    paymentReference.trim().length > 120
  ) {
    throw new Error("Enter a valid payment / transaction reference.");
  }

  if (
    typeof paymentNote !== "string" ||
    paymentNote.trim().length < 2 ||
    paymentNote.trim().length > 1000
  ) {
    throw new Error("Add a payment note before submitting for review.");
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("business_change_orders")
    .select("id,status,proof_bucket,proof_path,proof_file_name")
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (orderError) {
    throw new Error(`Unable to load the change order: ${orderError.message}`);
  }

  if (!order) {
    throw new Error("Change order was not found.");
  }

  if (!["pending_payment", "payment_submitted"].includes(order.status)) {
    throw new Error("This change order is no longer waiting for payment.");
  }

  if (!proofFile && !order.proof_path) {
    throw new Error("Upload payment proof before submitting for review.");
  }

  let uploadedProofPath: string | null = null;
  let uploadedProofFileName: string | null = null;
  let uploadedProofMimeType: string | null = null;
  let uploadedProofSizeBytes: number | null = null;

  if (proofFile) {
    if (!ALLOWED_PROOF_TYPES.has(proofFile.type)) {
      throw new Error("Payment proof must be a JPG, PNG, WEBP, or PDF file.");
    }

    if (proofFile.size > MAX_PROOF_BYTES) {
      throw new Error("Payment proof must be 10 MB or smaller.");
    }

    uploadedProofFileName = safeProofFileName(proofFile.name);
    uploadedProofMimeType = proofFile.type;
    uploadedProofSizeBytes = proofFile.size;
    uploadedProofPath = `${business.id}/${order.id}/${randomUUID()}.${proofExtension(
      proofFile.type,
    )}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUSINESS_CHANGE_PROOF_BUCKET)
      .upload(
        uploadedProofPath,
        new Uint8Array(await proofFile.arrayBuffer()),
        {
          contentType: proofFile.type,
          cacheControl: "3600",
          upsert: false,
        },
      );

    if (uploadError) {
      throw new Error(`Unable to upload payment proof: ${uploadError.message}`);
    }
  }

  const updatePayload: Record<string, unknown> = {
    payment_reference: paymentReference.trim(),
    payment_note: paymentNote.trim(),
    status: "payment_submitted",
    updated_at: new Date().toISOString(),
  };

  if (uploadedProofPath) {
    updatePayload.proof_bucket = BUSINESS_CHANGE_PROOF_BUCKET;
    updatePayload.proof_path = uploadedProofPath;
    updatePayload.proof_file_name = uploadedProofFileName;
    updatePayload.proof_mime_type = uploadedProofMimeType;
    updatePayload.proof_size_bytes = uploadedProofSizeBytes;
    updatePayload.proof_uploaded_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("business_change_orders")
    .update(updatePayload)
    .eq("id", order.id)
    .eq("business_id", business.id);

  if (error) {
    if (uploadedProofPath) {
      await supabaseAdmin.storage
        .from(BUSINESS_CHANGE_PROOF_BUCKET)
        .remove([uploadedProofPath]);
    }
    throw new Error(`Unable to submit payment details: ${error.message}`);
  }

  if (
    uploadedProofPath &&
    order.proof_path &&
    order.proof_bucket === BUSINESS_CHANGE_PROOF_BUCKET &&
    order.proof_path !== uploadedProofPath
  ) {
    const { error: cleanupError } = await supabaseAdmin.storage
      .from(BUSINESS_CHANGE_PROOF_BUCKET)
      .remove([order.proof_path]);

    if (cleanupError) {
      console.warn(
        "Unable to remove replaced business-change payment proof:",
        cleanupError.message,
      );
    }
  }

  await createAuditLog({
    action: "update",
    entityType: "business",
    entityId: business.id,
    description: "Submitted manual payment proof for a paid business change order",
    metadata: {
      change_order_id: order.id,
      payment_reference: paymentReference.trim(),
      payment_note_length: paymentNote.trim().length,
      proof_file_name:
        uploadedProofFileName ?? order.proof_file_name ?? "existing proof",
      proof_replaced: Boolean(uploadedProofPath && order.proof_path),
    },
  });

  revalidatePath(`/dashboard/settings/business/payment/${order.id}`);
  revalidatePath("/super-admin/manual-payments");
}
