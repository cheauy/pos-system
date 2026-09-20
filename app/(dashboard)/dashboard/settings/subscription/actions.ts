"use server";

import { getBranchEntitlement } from "@/lib/subscriptions/branch-limits";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { getAppUrl } from "@/lib/tenancy/domain";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  calculateCustomSubscriptionPrice,
  subscriptionPlans,
  isSubscriptionPlanKey,
  isSubscriptionTermMonths,
} from "@/lib/subscriptions/plans";
import {
  checkTrialRegistrationEligibility,
  recordTrialSignupEvent,
} from "@/lib/subscriptions/trial-protection";

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
  const business = await getCurrentBusinessForSubscription({ startTrial: false });

  if (business.role !== "owner") {
    throw new Error("Only the business owner can purchase a subscription.");
  }

  const planValue = formData.get("plan");
  const termValue = formData.get("termMonths");
  const userLimitValue = formData.get("userLimit");

  const plan = typeof planValue === "string" ? planValue : "";
  const termMonths = Number(termValue);
  const requestedUserLimit = Number(userLimitValue);
  const requestedBranchLimit = Number(formData.get("branchLimit") ?? 1);

  if (!isSubscriptionPlanKey(plan)) {
    throw new Error("Choose a valid subscription plan.");
  }

  if (!isSubscriptionTermMonths(termMonths)) {
    throw new Error("Choose a valid subscription term.");
  }

  if (plan === "custom") {
    calculateCustomSubscriptionPrice(requestedUserLimit, requestedBranchLimit, termMonths);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Your session expired. Please sign in again.");
  }

  let { data, error } = await supabaseAdmin.rpc("create_branch_subscription_order", {
    p_business_id: business.id,
    p_requesting_user_id: user.id,
    p_plan_key: plan,
    p_term_months: termMonths,
    p_requested_user_limit: plan === "custom" ? requestedUserLimit : subscriptionPlans[plan].userLimit,
    p_base_plan_key: plan === "custom" ? null : plan,
    p_requested_branch_limit: plan === "custom" ? requestedBranchLimit : 1,
  });

  if (error?.code === "PGRST202" && plan !== "custom") {
    const branches = await getBranchEntitlement(business.id);
    if (branches.used > 1) throw new Error("This plan includes one branch. Deactivate unused branches before continuing.");
    const { count: activeUsers, error: memberError } = await supabaseAdmin.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("is_active", true);
    if (memberError) throw new Error("Unable to verify current user usage.");
    if ((activeUsers ?? 0) > (subscriptionPlans[plan].userLimit ?? 1)) throw new Error("This plan does not cover your active users. Deactivate unused users or select a larger plan.");
    ({ data, error } = await supabaseAdmin.rpc("create_subscription_order", { p_business_id: business.id, p_requesting_user_id: user.id, p_plan_key: plan, p_term_months: termMonths, p_requested_user_limit: subscriptionPlans[plan].userLimit }));
  }
  if (error) {
    if (error.code === "PGRST202") throw new Error("Branch subscription checkout is not deployed yet. Apply 20260920_subscription_branch_limits.sql, then try again.");
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


function trialBlockReason(message: string | undefined) {
  const value = (message ?? "").toLowerCase();
  if (value.includes("email provider")) return "disposable_email";
  if (value.includes("already") && value.includes("trial")) return "trial_already_used";
  if (value.includes("too many")) return "trial_signup_limit";
  return "trial_ineligible";
}

export async function continueFreeTrial(_formData: FormData) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });

  if (business.role !== "owner") {
    throw new Error("Only the business owner can start the free trial.");
  }

  if (business.subscriptionStatus === "trialing" || business.subscriptionStatus === "active") {
    redirect(getAppUrl("/dashboard"));
  }

  if (business.subscriptionStatus !== "trial_pending") {
    redirect(getAppUrl("/dashboard/settings/subscription/plans?onboarding=1&trial=unavailable"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    throw new Error("Your verified email is required to start the 7-day free trial.");
  }

  const decision = await checkTrialRegistrationEligibility(user.email);

  await supabaseAdmin
    .from("businesses")
    .update({
      trial_signup_fingerprint_hash: decision.fingerprintHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", business.id);

  if (!decision.allowed) {
    await supabaseAdmin
      .from("businesses")
      .update({
        subscription_status: "trial_blocked",
        trial_block_reason: trialBlockReason(decision.message),
        updated_at: new Date().toISOString(),
      })
      .eq("id", business.id)
      .eq("subscription_status", "trial_pending");

    redirect(getAppUrl("/dashboard/settings/subscription/plans?onboarding=1&trial=unavailable"));
  }

  await recordTrialSignupEvent({
    ...decision,
    businessId: business.id,
  });

  const { error: trialError } = await supabase.rpc(
    "ensure_business_trial_started",
    { p_business_id: business.id },
  );

  if (trialError) {
    throw new Error(`Unable to start free trial: ${trialError.message}`);
  }

  const { data: refreshed, error: refreshedError } = await supabaseAdmin
    .from("businesses")
    .select("subscription_status")
    .eq("id", business.id)
    .maybeSingle();

  if (refreshedError) {
    throw new Error(`Unable to verify free trial: ${refreshedError.message}`);
  }

  if (refreshed?.subscription_status !== "trialing") {
    redirect(getAppUrl("/dashboard/settings/subscription/plans?onboarding=1&trial=unavailable"));
  }

  revalidatePath("/dashboard/settings/subscription");
  redirect(getAppUrl("/dashboard"));
}

export async function selectSubscriptionPaymentMethod(formData: FormData) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });

  if (business.role !== "owner") {
    throw new Error("Only the business owner can choose a subscription payment method.");
  }

  const orderId = formData.get("orderId");
  const method = formData.get("paymentMethod");

  if (typeof orderId !== "string" || !orderId) {
    throw new Error("Subscription order is required.");
  }

  if (method !== "aba_khqr" && method !== "manual") {
    throw new Error("Choose ABA KHQR or Manual payment.");
  }

  const { data: updatedOrder, error } = await supabaseAdmin
    .from("subscription_orders")
    .update({
      payment_method: method,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", business.id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (error || !updatedOrder) {
    throw new Error(
      error?.message ?? "This subscription order is no longer waiting for payment.",
    );
  }

  revalidatePath(`/dashboard/settings/subscription/payment/${orderId}`);
  redirect(`/dashboard/settings/subscription/payment/${orderId}`);
}

export async function submitSubscriptionPayment(formData: FormData) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });

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
      "id,status,total_amount,payment_method,proof_bucket,proof_path,proof_file_name,requested_by_user_id,pricing_locked_until",
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

  if (order.payment_method !== "aba_khqr" && order.payment_method !== "manual") {
    throw new Error("Choose ABA KHQR or Manual payment before submitting proof.");
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
