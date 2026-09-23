"use server";

import { subscriptionSelection, subscriptionFailure, type SubscriptionSelectionState } from "@/lib/subscriptions/checkout-input";
import { isConfirmedRollback } from "@/lib/operations/rpc-outcome";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { getAppUrl } from "@/lib/tenancy/domain";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cancelSubscriptionPaywayCheckout } from "@/lib/payway/server";
import { getManualPaymentConfig } from "@/lib/subscriptions/manual-bank";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionPlanKey, isSubscriptionTermMonths } from "@/lib/subscriptions/plans";
import {
  expireStaleSubscriptionPaymentRequestsForBusiness,
  expireSubscriptionPaymentRequestSafely,
  isSubscriptionPaymentExpired,
} from "@/lib/subscriptions/payment-expiry";
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

// No client-supplied price/credit is accepted. The locked SQL quote is authoritative.
async function prepareSubscriptionOrder(formData: FormData, reactivateCurrent = false) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  if (business.role !== "owner") throw new Error("Only the business owner can purchase a subscription.");
  const expectedBusinessId=formData.get('expectedBusinessId');
  if(typeof expectedBusinessId!=='string' || expectedBusinessId!==business.id) throw new Error('Your active business changed or this checkout page is stale. Reload plans before purchasing.');
  if (reactivateCurrent) {
    if (business.subscriptionStatus !== "expired") throw new Error("Your subscription is no longer expired. Refresh Subscription to see its current status.");
    const { data: current, error } = await supabaseAdmin.from("businesses")
      .select("subscription_plan_key,subscription_user_limit,subscription_branch_limit,subscription_months")
      .eq("id", business.id).maybeSingle();
    if (error || !current) throw new Error("Unable to load your current subscription. Please try again.");
    if (!isSubscriptionPlanKey(current.subscription_plan_key)) {
      return "/dashboard/settings/subscription?view=plans&expired=change";
    }
    const months = Number(current.subscription_months);
    if (!isSubscriptionTermMonths(months)) throw new Error("Your previous billing term is unavailable. Choose another plan to continue.");
    formData = new FormData();
    formData.set("plan", current.subscription_plan_key);
    formData.set("termMonths", String(months));
    formData.set("userLimit", String(current.subscription_user_limit));
    formData.set("branchLimit", String(current.subscription_branch_limit));
    formData.set("expiredAction", "reactivate");
  }
  const selection = subscriptionSelection(formData);
  const expiredAction = formData.get("expiredAction");
  // Upgrade duration is chosen on the payment page. Older clients may still
  // submit 0 here; create the initial upgrade quote with a valid 1-month term
  // so subscription_orders_term_check is never violated.
  const initialTermMonths = selection.term === 0 ? 1 : selection.term;

  if (business.subscriptionStatus === "expired") {
    if (expiredAction !== "reactivate" && expiredAction !== "change") {
      throw new Error("Choose Reactivate or choose a new plan from the expired Subscription screen.");
    }

    if (expiredAction === "reactivate") {
      if (selection.term === 0) {
        throw new Error("Choose a new billing term to reactivate the subscription.");
      }

      const { data: latestSubscription, error: latestSubscriptionError } =
        await supabaseAdmin
          .from("businesses")
          .select("subscription_plan_key,subscription_user_limit,subscription_branch_limit")
          .eq("id", business.id)
          .maybeSingle();

      if (latestSubscriptionError || !latestSubscription) {
        throw new Error(
          latestSubscriptionError?.message ??
            "Unable to verify the latest subscription before reactivation.",
        );
      }

      const latestPlan = latestSubscription.subscription_plan_key;
      const latestUsers = Math.max(
        1,
        Number(latestSubscription.subscription_user_limit) || 1,
      );
      const latestBranches = Math.max(
        1,
        Number(latestSubscription.subscription_branch_limit) || 1,
      );

      if (
        !latestPlan ||
        selection.plan !== latestPlan ||
        selection.users !== latestUsers ||
        selection.branches !== latestBranches
      ) {
        throw new Error(
          `Reactivate keeps your latest subscription unchanged (${latestUsers} ${latestUsers === 1 ? "user" : "users"} · ${latestBranches} ${latestBranches === 1 ? "branch" : "branches"}). Use Choose a different plan if you want to change capacity.`,
        );
      }
    }
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Your session expired. Please sign in again.");

  // Clear expired 10-minute requests before checking for an open PayWay
  // transaction. An unresolved PayWay transaction stays locked for safety.
  await expireStaleSubscriptionPaymentRequestsForBusiness(business.id);

  if (reactivateCurrent) {
    const { data: existing, error } = await supabaseAdmin.from("subscription_orders")
      .select("id,status,payment_expires_at,payment_expired_at,created_at")
      .eq("business_id", business.id).eq("plan_key", selection.plan)
      .eq("term_months", initialTermMonths).eq("requested_user_limit", selection.users)
      .eq("requested_branch_limit", selection.branches)
      .in("status", ["pending_payment", "payment_submitted"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Unable to check your existing payment request. Please try again.");
    if (existing && (existing.status === "payment_submitted" || !isSubscriptionPaymentExpired(existing))) {
      return `/dashboard/settings/subscription/payment/${existing.id}`;
    }
  }

  const keepMemberIds = formData.getAll("keepMemberId").filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value));
  const keepBranchIds = formData.getAll("keepBranchId").filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value));

  // Only a PayWay checkout that is still inside TENH's authoritative payment
  // window can block a new subscription selection. An expired TENH request may
  // remain provider-locked externally when PayWay refuses Close Transaction,
  // but it must not trap the owner on an old plan. Late provider approvals are
  // isolated for review in the PayWay verification path instead of activating.
  const paymentWindowNow = new Date().toISOString();
  const { data: openPayway, error: openPaywayError } = await supabaseAdmin
    .from("subscription_orders")
    .select("id")
    .eq("business_id", business.id)
    .eq("status", "pending_payment")
    .eq("payment_provider", "aba_payway")
    .is("payment_expired_at", null)
    .gt("payment_expires_at", paymentWindowNow)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openPaywayError) throw new Error(`Unable to verify existing payment checkout: ${openPaywayError.message}`);
  if (openPayway?.id) {
    throw new Error(`An ABA PayWay checkout is already open. Check or cancel payment order ${String(openPayway.id).slice(0, 8).toUpperCase()} before choosing another plan.`);
  }

  const {data,error} = await supabaseAdmin.rpc("create_safe_subscription_order", {
    p_business_id:business.id,p_requesting_user_id:user.id,p_plan_key:selection.plan,
    p_term_months:initialTermMonths,p_requested_user_limit:selection.users,
    p_requested_branch_limit:selection.branches,
    p_keep_member_ids:keepMemberIds.length ? keepMemberIds : null,
    p_keep_branch_ids:keepBranchIds.length ? keepBranchIds : null,
  });
  if(error) throw new Error(subscriptionFailure(error));
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.order_id || typeof row.order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.order_id)) throw new Error('Subscription order was not confirmed. Check Subscription before retrying.');
  try {revalidatePath('/dashboard/settings/subscription');} catch { /* Quote is committed. */ }
  return `/dashboard/settings/subscription/payment/${row.order_id}`;
}
// Retained for older callers. The new plans form displays expected errors inline.
export async function createSubscriptionOrder(formData: FormData) {
  redirect(await prepareSubscriptionOrder(formData));
}
export async function submitSubscriptionSelection(_previous: SubscriptionSelectionState, formData: FormData): Promise<SubscriptionSelectionState> {
  let destination: string;
  try { destination=await prepareSubscriptionOrder(formData); }
  catch(error) {return {error:subscriptionFailure(error)};}
  // Redirect must not be caught and rendered as a failed purchase.
  redirect(destination);
}

export async function reactivateCurrentSubscription(_previous: SubscriptionSelectionState, formData: FormData): Promise<SubscriptionSelectionState> {
  let destination: string;
  try { destination = await prepareSubscriptionOrder(formData, true); }
  catch (error) { return { error: subscriptionFailure(error) }; }
  redirect(destination);
}


export async function changePendingUpgradeDuration(formData: FormData) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  if (business.role !== "owner") {
    throw new Error("Only the business owner can change an upgrade duration.");
  }

  const orderId = formData.get("orderId");
  const termValue = formData.get("termMonths");
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    throw new Error("A valid subscription order is required.");
  }
  if (typeof termValue !== "string" || !/^(0|1|3|6|12)$/.test(termValue)) {
    throw new Error("Choose Keep current, 1 month, 3 months, 6 months, or 1 year.");
  }
  const termMonths = Number(termValue);

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Your session expired. Please sign in again.");

  await expireSubscriptionPaymentRequestSafely({
    businessId: business.id,
    orderId,
  });

  const { data, error } = await supabaseAdmin.rpc("update_pending_subscription_billing_term", {
    p_business_id: business.id,
    p_requesting_user_id: user.id,
    p_order_id: orderId,
    p_term_months: termMonths,
  });
  if (error) throw new Error(subscriptionFailure(error));

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.order_id || row.order_id !== orderId) {
    throw new Error("The updated upgrade quote was not confirmed. Refresh Checkout and try again.");
  }

  revalidatePath("/dashboard/settings/subscription");
  revalidatePath(`/dashboard/settings/subscription/payment/${orderId}`);
  redirect(`/dashboard/settings/subscription/payment/${orderId}`);
}

export async function saveScheduledRenewalSelection(formData: FormData) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  if (business.role !== "owner") throw new Error("Only the business owner can change this selection.");
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Next-plan order is required.");
  const keepMemberIds = formData.getAll("keepMemberId").filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value));
  const keepBranchIds = formData.getAll("keepBranchId").filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value));
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Your session expired. Please sign in again.");
  const { data, error } = await supabaseAdmin.rpc("update_subscription_keep_selection", {
    p_business_id: business.id,
    p_user_id: user.id,
    p_order_id: orderId,
    p_keep_member_ids: keepMemberIds.length ? keepMemberIds : null,
    p_keep_branch_ids: keepBranchIds.length ? keepBranchIds : null,
  });
  if (error || !data) throw new Error(error?.message ?? "Unable to save the keep-active selection.");
  revalidatePath("/dashboard/settings/subscription");
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
    redirect(getAppUrl("/dashboard/settings/subscription?view=plans&onboarding=1&trial=unavailable"));
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

    redirect(getAppUrl("/dashboard/settings/subscription?view=plans&onboarding=1&trial=unavailable"));
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
    redirect(getAppUrl("/dashboard/settings/subscription?view=plans&onboarding=1&trial=unavailable"));
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

  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    throw new Error("Subscription order is required.");
  }

  if (method !== "manual") {
    throw new Error("Choose Manual payment or use ABA PayWay checkout.");
  }

  const manualConfig = getManualPaymentConfig();
  if (!manualConfig.enabled) {
    throw new Error(
      "Manual payment is not available. Check TENH_MANUAL_PAYMENT_* configuration.",
    );
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Your session expired. Please sign in again.");

  const { data: routeOrder, error: routeError } = await supabaseAdmin
    .from("subscription_orders")
    .select(
      "id,status,payment_provider,payway_tran_id,payment_expires_at,created_at,plan_key,term_months,requested_user_limit,requested_branch_limit,keep_member_ids,keep_branch_ids",
    )
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (routeError || !routeOrder) {
    throw new Error(routeError?.message ?? "Subscription order was not found.");
  }
  if (routeOrder.status !== "pending_payment") {
    throw new Error("This subscription order is not waiting for payment.");
  }
  if (isSubscriptionPaymentExpired(routeOrder)) {
    await expireSubscriptionPaymentRequestSafely({ businessId: business.id, orderId });
    throw new Error("This 10-minute payment request expired. Create a new payment request to continue.");
  }

  let targetOrderId = orderId;

  // PayWay -> Manual must never be a local-only toggle. If a PayWay
  // transaction was actually started, verify it first and close it at PayWay.
  // Only after PayWay confirms the unpaid transaction is closed do we create a
  // fresh replacement TENH order for Manual payment. The cancelled PayWay order
  // remains in history, so provider reconciliation is never lost.
  if (routeOrder.payment_provider === "aba_payway" || routeOrder.payway_tran_id) {
    let result: Awaited<ReturnType<typeof cancelSubscriptionPaywayCheckout>>;
    try {
      result = await cancelSubscriptionPaywayCheckout({
        orderId,
        businessId: business.id,
        reason: "owner_cancelled",
      });
    } catch {
      redirect(
        `/dashboard/settings/subscription/payment/${orderId}?switch=payway_status_unavailable`,
      );
    }

    if (result.state === "approved") {
      try {
        revalidatePath(`/dashboard/settings/subscription/payment/${orderId}`);
        revalidatePath("/dashboard/settings/subscription");
      } catch { /* Payment confirmation is already committed. */ }
      redirect(`/dashboard/settings/subscription/payment/${orderId}`);
    }

    if (result.state === "provider_close_unavailable") {
      redirect(
        `/dashboard/settings/subscription/payment/${orderId}?switch=payway_close_unavailable`,
      );
    }

    const { data: replacement, error: replacementError } = await supabaseAdmin.rpc(
      "create_safe_subscription_order",
      {
        p_business_id: business.id,
        p_requesting_user_id: user.id,
        p_plan_key: routeOrder.plan_key,
        p_term_months: routeOrder.term_months,
        p_requested_user_limit: routeOrder.requested_user_limit,
        p_requested_branch_limit: routeOrder.requested_branch_limit,
        p_keep_member_ids:
          Array.isArray(routeOrder.keep_member_ids) && routeOrder.keep_member_ids.length
            ? routeOrder.keep_member_ids
            : null,
        p_keep_branch_ids:
          Array.isArray(routeOrder.keep_branch_ids) && routeOrder.keep_branch_ids.length
            ? routeOrder.keep_branch_ids
            : null,
      },
    );

    if (replacementError) throw new Error(subscriptionFailure(replacementError));
    const replacementRow = Array.isArray(replacement) ? replacement[0] : replacement;
    if (
      !replacementRow?.order_id ||
      typeof replacementRow.order_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(replacementRow.order_id)
    ) {
      throw new Error(
        "ABA PayWay was closed, but TENH could not create the replacement Manual payment request. Return to Choose Subscription.",
      );
    }
    targetOrderId = replacementRow.order_id;
  }

  const { data: updatedOrder, error } = await supabaseAdmin.rpc(
    "tenh_subscription_payment",
    {
      p_business_id: business.id,
      p_user_id: user.id,
      p_order_id: targetOrderId,
      p_action: "method",
      p_input: { method },
    },
  );

  if (error || !updatedOrder) {
    throw new Error(
      error
        ? subscriptionFailure(error)
        : "Payment method was not confirmed. Refresh this order before paying.",
    );
  }

  try {
    revalidatePath(`/dashboard/settings/subscription/payment/${orderId}`);
    if (targetOrderId !== orderId) {
      revalidatePath(`/dashboard/settings/subscription/payment/${targetOrderId}`);
    }
    revalidatePath("/dashboard/settings/subscription");
  } catch { /* Selection is committed. */ }

  redirect(`/dashboard/settings/subscription/payment/${targetOrderId}`);
}

export async function expireSubscriptionPaymentRequest(orderId: string) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  if (business.role !== "owner") {
    throw new Error("Only the business owner can expire a subscription payment request.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    throw new Error("Subscription order is required.");
  }

  const result = await expireSubscriptionPaymentRequestSafely({
    businessId: business.id,
    orderId,
  });

  try {
    revalidatePath(`/dashboard/settings/subscription/payment/${orderId}`);
    revalidatePath("/dashboard/settings/subscription");
  } catch { /* Expiry/verification is already committed. */ }

  return result;
}

export async function cancelPendingSubscriptionPayment(formData: FormData) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  if (business.role !== "owner") {
    throw new Error("Only the business owner can cancel a pending payment request.");
  }

  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    throw new Error("Subscription order is required.");
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Your session expired. Please sign in again.");

  const { data: order, error: orderError } = await supabaseAdmin
    .from("subscription_orders")
    .select("id,status,payment_provider,payway_tran_id,payway_verified_at,proof_path,payment_expired_at")
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (orderError) throw new Error(`Unable to verify this payment request: ${orderError.message}`);
  if (!order) throw new Error("Subscription payment request was not found.");

  // Idempotent: an already-cancelled/expired request is safe to leave closed.
  if (order.status === "cancelled") {
    redirect("/dashboard/settings/subscription");
  }

  // Never let a cancellation race revoke a payment that is already under review
  // or approved. The owner must use the normal review/refund flow instead.
  if (order.status !== "pending_payment") {
    throw new Error("Only an unpaid pending payment request can be cancelled.");
  }
  if (order.proof_path) {
    throw new Error("Payment proof is already attached. This request can no longer be cancelled as unpaid.");
  }

  if (order.payment_provider === "aba_payway" && order.payway_tran_id) {
    // PayWay is verified first. If it is already approved, the subscription is
    // confirmed instead of cancelled. Otherwise the external transaction is
    // closed before TENH marks the request cancelled.
    let result: Awaited<ReturnType<typeof cancelSubscriptionPaywayCheckout>>;
    try {
      result = await cancelSubscriptionPaywayCheckout({
        orderId,
        businessId: business.id,
        reason: "owner_cancelled",
      });
    } catch {
      redirect(`/dashboard/settings/subscription/payment/${orderId}?cancel=payway_unavailable`);
    }
    try {
      revalidatePath(`/dashboard/settings/subscription/payment/${orderId}`);
      revalidatePath("/dashboard/settings/subscription");
    } catch { /* The provider verification/cancellation is already committed. */ }

    if (result.state === "approved") {
      redirect(`/dashboard/settings/subscription/payment/${orderId}`);
    }
    if (result.state === "provider_close_unavailable") {
      redirect(`/dashboard/settings/subscription/payment/${orderId}?cancel=payway_close_unavailable`);
    }
    redirect("/dashboard/settings/subscription");
  }

  const { data: cancelled, error: cancelError } = await supabaseAdmin.rpc(
    "cancel_pending_subscription_payment_order",
    {
      p_business_id: business.id,
      p_order_id: orderId,
      p_requesting_user_id: user.id,
    },
  );
  if (cancelError) throw new Error(subscriptionFailure(cancelError));

  const state = cancelled && typeof cancelled === "object" && "state" in cancelled
    ? String((cancelled as { state?: unknown }).state ?? "")
    : "";
  if (state === "approved" || state === "payment_submitted") {
    throw new Error("This payment is no longer unpaid, so it was not cancelled.");
  }

  try {
    revalidatePath(`/dashboard/settings/subscription/payment/${orderId}`);
    revalidatePath("/dashboard/settings/subscription");
  } catch { /* Cancellation is already committed. */ }

  redirect("/dashboard/settings/subscription");
}

export async function cancelSubscriptionPaywayPayment(formData: FormData) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  if (business.role !== "owner") throw new Error("Only the business owner can cancel ABA PayWay checkout.");
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    throw new Error("Subscription order is required.");
  }

  let result: Awaited<ReturnType<typeof cancelSubscriptionPaywayCheckout>>;
  try {
    result = await cancelSubscriptionPaywayCheckout({ orderId, businessId: business.id });
  } catch {
    redirect(`/dashboard/settings/subscription/payment/${orderId}?cancel=payway_unavailable`);
  }
  try {
    revalidatePath(`/dashboard/settings/subscription/payment/${orderId}`);
    revalidatePath("/dashboard/settings/subscription");
  } catch { /* Cancellation/verification is already committed. */ }

  if (result.state === "approved") {
    redirect(`/dashboard/settings/subscription/payment/${orderId}`);
  }
  if (result.state === "provider_close_unavailable") {
    redirect(`/dashboard/settings/subscription/payment/${orderId}?cancel=payway_close_unavailable`);
  }
  redirect("/dashboard/settings/subscription");
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

  if (typeof paymentNote !== "string" || paymentNote.trim().length > 1000) {
    throw new Error("Payment note must be 1000 characters or fewer.");
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("subscription_orders")
    .select(
      "id,status,total_amount,currency,payment_method,payment_provider,proof_bucket,proof_path,proof_file_name,requested_by_user_id,pricing_locked_until,payment_expires_at,created_at",
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

  if (order.status === "payment_submitted") return; // Retry after a committed/lost response.
  if (order.status !== "pending_payment") {
    throw new Error("This subscription order is not waiting for payment.");
  }
  if (isSubscriptionPaymentExpired(order)) {
    await expireSubscriptionPaymentRequestSafely({ businessId: business.id, orderId: order.id });
    throw new Error("This 10-minute payment request expired. Create a new payment request before submitting proof.");
  }
  if (order.payment_provider === "aba_payway") {
    throw new Error("This order is already locked to ABA PayWay. Do not upload a second payment proof.");
  }

  // Keep legacy ABA KHQR orders reviewable, but new checkout selection no longer exposes KHQR.
  if (order.payment_method !== "aba_khqr" && order.payment_method !== "manual") {
    throw new Error("Choose Manual payment before submitting proof, or use ABA PayWay checkout.");
  }

  if (order.pricing_locked_until) {
    const lockExpiresAt = new Date(order.pricing_locked_until).getTime();
    if (Number.isFinite(lockExpiresAt) && lockExpiresAt <= Date.now()) {
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

  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)throw new Error('Session expired. Uploaded proof is retained; sign in and check the payment order.');
  const normalizedNote = paymentNote.trim() || "Manual bank transfer";
  const {data:updatedOrder,error:updateError}=await supabaseAdmin.rpc('tenh_subscription_payment',{
    p_business_id:business.id,p_user_id:user.id,p_order_id:order.id,p_action:'submit',
    p_input:{note:normalizedNote,bucket:uploadedPath?PROOF_BUCKET:null,path:uploadedPath,name:uploadedName,mime:uploadedMime,size:uploadedSize},
  });
  if(updateError || !updatedOrder) {
    // Never delete proof on an uncertain network result: it may be the committed
    // proof being reviewed. Only an explicit SQL rollback permits cleanup.
    if(uploadedPath && updateError && isConfirmedRollback(updateError)) {
      try {await supabaseAdmin.storage.from(PROOF_BUCKET).remove([uploadedPath]);} catch { /* Optional orphan cleanup. */ }
    }
    throw new Error(updateError?subscriptionFailure(updateError):'Submission could not be confirmed. Refresh this same payment order; do not pay again.');
  }
  // Original/replaced proofs are retained for audit; no cleanup can invalidate a
  // concurrent successful submission. Retention cleanup is a separate admin task.


  try {
    revalidatePath(`/dashboard/settings/subscription/payment/${order.id}`);
    revalidatePath("/dashboard/settings/subscription");
    revalidatePath("/super-admin/subscription-payments");
  } catch { /* Proof is committed. Never report a failed payment after refresh fails. */ }
}
