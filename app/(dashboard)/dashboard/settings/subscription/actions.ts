"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isSubscriptionPlanKey,
  isSubscriptionTermMonths,
} from "@/lib/subscriptions/plans";

const PROOF_BUCKET = "tenh-pos-subscription-payment-proofs";
const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

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

function safeFileName(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 120) || "subscription-payment-proof"
  );
}

export async function createSubscriptionOrder(formData: FormData) {
  const business = await getCurrentBusinessForSubscription();

  if (business.role !== "owner") {
    throw new Error("Only the business owner can purchase a subscription.");
  }

  const planValue = formData.get("plan");
  const termValue = formData.get("termMonths");
  const userLimitValue = formData.get("userLimit");

  const plan = typeof planValue === "string" ? planValue : "";
  const termMonths = Number(termValue);
  const requestedUserLimit = Number(userLimitValue);

  if (!isSubscriptionPlanKey(plan)) {
    throw new Error("Choose a valid subscription plan.");
  }

  if (!isSubscriptionTermMonths(termMonths)) {
    throw new Error("Choose a valid subscription term.");
  }

  if (plan === "custom") {
    if (!Number.isInteger(requestedUserLimit) || requestedUserLimit < 11 || requestedUserLimit > 500) {
      throw new Error("Custom Team requires between 11 and 500 users.");
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Your session expired. Please sign in again.");
  }

  const { data, error } = await supabaseAdmin.rpc("create_subscription_order", {
    p_business_id: business.id,
    p_requesting_user_id: user.id,
    p_plan_key: plan,
    p_term_months: termMonths,
    p_requested_user_limit: plan === "custom" ? requestedUserLimit : null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const orderId = row?.order_id;
  const orderStatus = row?.order_status;

  if (!orderId) {
    throw new Error("Subscription order was not created.");
  }

  revalidatePath("/dashboard/settings/subscription");

  if (orderStatus === "quote_requested") {
    redirect("/dashboard/settings/subscription?quote=requested");
  }

  redirect(`/dashboard/settings/subscription/payment/${orderId}`);
}

export async function submitSubscriptionPayment(formData: FormData) {
  const business = await getCurrentBusinessForSubscription();

  if (business.role !== "owner") {
    throw new Error("Only the business owner can submit subscription payment proof.");
  }

  const orderId = formData.get("orderId");
  const paymentNote = formData.get("paymentNote");
  const proofValue = formData.get("paymentProof");
  const proofFile = proofValue instanceof File && proofValue.size > 0 ? proofValue : null;

  if (typeof orderId !== "string" || !orderId) {
    throw new Error("Subscription order is required.");
  }

  if (
    typeof paymentNote !== "string" ||
    paymentNote.trim().length < 2 ||
    paymentNote.trim().length > 1000
  ) {
    throw new Error("Add a payment note before submitting for review.");
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("subscription_orders")
    .select(
      "id,status,total_amount,proof_bucket,proof_path,proof_file_name,requested_by_user_id,pricing_locked_until",
    )
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (orderError) {
    throw new Error(`Unable to load subscription order: ${orderError.message}`);
  }

  if (!order) {
    throw new Error("Subscription order was not found.");
  }

  if (order.status !== "pending_payment") {
    throw new Error("This subscription order is not waiting for payment.");
  }

  if (order.pricing_locked_until) {
    const lockExpiresAt = new Date(order.pricing_locked_until).getTime();
    if (Number.isFinite(lockExpiresAt) && lockExpiresAt <= Date.now()) {
      await supabaseAdmin
        .from("subscription_orders")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("business_id", business.id)
        .eq("status", "pending_payment");

      throw new Error(
        "This subscription price expired. Return to Subscription and create a fresh order so the upgrade credit is recalculated safely.",
      );
    }
  }

  if (!order.total_amount || Number(order.total_amount) <= 0) {
    throw new Error("This subscription order does not have an approved payment amount yet.");
  }

  if (!proofFile && !order.proof_path) {
    throw new Error("Upload payment proof before submitting for review.");
  }

  let uploadedPath: string | null = null;
  let uploadedName: string | null = null;
  let uploadedMime: string | null = null;
  let uploadedSize: number | null = null;

  if (proofFile) {
    if (!ALLOWED_PROOF_TYPES.has(proofFile.type)) {
      throw new Error("Payment proof must be JPG, PNG, WEBP, or PDF.");
    }
    if (proofFile.size > MAX_PROOF_BYTES) {
      throw new Error("Payment proof must be 10 MB or smaller.");
    }

    uploadedName = safeFileName(proofFile.name);
    uploadedMime = proofFile.type;
    uploadedSize = proofFile.size;
    uploadedPath = `${business.id}/${order.id}/${randomUUID()}.${proofExtension(proofFile.type)}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(PROOF_BUCKET)
      .upload(uploadedPath, new Uint8Array(await proofFile.arrayBuffer()), {
        contentType: proofFile.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Unable to upload payment proof: ${uploadError.message}`);
    }
  }

  const update: Record<string, unknown> = {
    payment_note: paymentNote.trim(),
    status: "payment_submitted",
    updated_at: new Date().toISOString(),
  };

  if (uploadedPath) {
    update.proof_bucket = PROOF_BUCKET;
    update.proof_path = uploadedPath;
    update.proof_file_name = uploadedName;
    update.proof_mime_type = uploadedMime;
    update.proof_size_bytes = uploadedSize;
    update.proof_uploaded_at = new Date().toISOString();
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from("subscription_orders")
    .update(update)
    .eq("id", order.id)
    .eq("business_id", business.id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (updateError || !updatedOrder) {
    if (uploadedPath) {
      await supabaseAdmin.storage.from(PROOF_BUCKET).remove([uploadedPath]);
    }
    throw new Error(
      updateError
        ? `Unable to submit subscription payment: ${updateError.message}`
        : "This subscription order is no longer waiting for payment.",
    );
  }

  if (
    uploadedPath &&
    order.proof_bucket === PROOF_BUCKET &&
    order.proof_path &&
    order.proof_path !== uploadedPath
  ) {
    await supabaseAdmin.storage.from(PROOF_BUCKET).remove([order.proof_path]);
  }

  revalidatePath(`/dashboard/settings/subscription/payment/${order.id}`);
  revalidatePath("/dashboard/settings/subscription");
  revalidatePath("/super-admin/subscription-payments");
}
