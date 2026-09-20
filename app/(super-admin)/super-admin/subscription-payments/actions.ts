"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

const REJECTION_MESSAGES = new Set([
  "We could not verify this payment. Please check the payment and submit a clear payment proof again.",
  "The payment proof is unclear or incomplete. Please upload a clear payment proof and submit again.",
  "The payment amount or payment details do not match this subscription order. Please correct the payment information and submit again.",
]);

export async function quoteCustomSubscriptionOrder(formData: FormData) {
  const admin = await requireSuperAdmin();
  const orderId = String(formData.get("orderId") ?? "").trim();
  const monthlyPrice = Number(formData.get("monthlyPrice"));

  if (!orderId) throw new Error("Subscription quote ID is required.");
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
    throw new Error("Enter a valid custom monthly price.");
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("subscription_orders")
    .select("id,business_id,requested_by_user_id,plan_key,status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Subscription quote was not found.");
  }

  const { data: total, error } = await supabaseAdmin.rpc(
    "quote_custom_subscription_order",
    {
      p_order_id: order.id,
      p_monthly_price: monthlyPrice,
      p_admin_user_id: admin.id,
      p_admin_email: admin.email,
    },
  );

  if (error) throw new Error(error.message);

  if (order.requested_by_user_id) {
    const totalValue = Array.isArray(total) ? total[0] : total;
    await supabaseAdmin.from("business_notifications").upsert(
      {
        business_id: order.business_id,
        notification_key: `subscription-quote:${order.id}`,
        notification_type: "subscription_quote",
        severity: "info",
        title: "Custom subscription quote ready",
        message: `Your TENH POS custom subscription quote is ready${totalValue ? `: $${Number(totalValue).toFixed(2)} USD` : ""}. Open Subscription to pay by ABA QR.`,
        href: `/dashboard/settings/subscription/payment/${order.id}`,
        target_roles: ["owner"],
        target_user_id: order.requested_by_user_id,
        source_table: "subscription_orders",
        source_id: order.id,
        occurred_at: new Date().toISOString(),
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id,notification_key" },
    );
  }

  revalidatePath("/super-admin/subscription-payments");
  revalidatePath("/dashboard/settings/subscription");
}

export async function reviewSubscriptionPayment(formData: FormData) {
  const admin = await requireSuperAdmin();
  const orderId = String(formData.get("orderId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();

  if (!orderId) throw new Error("Subscription payment ID is required.");
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Choose Approve or Reject.");
  }
  if (decision === "reject" && !REJECTION_MESSAGES.has(reviewNote)) {
    throw new Error("Select one of the approved rejection messages.");
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("subscription_orders")
    .select(
      "*",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Subscription payment was not found.");
  }

  if (order.status !== "payment_submitted" && !(decision === "approve" && order.status === "approved")) {
    throw new Error("Only a submitted subscription payment can be reviewed.");
  }

  if (decision === "approve" && (!order.payment_note || !order.proof_bucket || !order.proof_path)) {
    throw new Error("Payment note and proof are required before approval.");
  }

  const reviewArgs = {
    p_order_id: order.id,
    p_decision: decision,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
    p_review_note: reviewNote || null,
  };
  let { data: result, error } = await supabaseAdmin.rpc("review_branch_subscription_order", reviewArgs);
  if (error?.code === "PGRST202" && ![2, 3].includes(order.pricing_version)) ({ data: result, error } = await supabaseAdmin.rpc("review_subscription_order", reviewArgs));

  if (error) throw new Error(error.message);

  const row = Array.isArray(result) ? result[0] : result;

  await supabaseAdmin.from("audit_logs").insert({
    business_id: order.business_id,
    user_id: admin.id,
    action: decision === "approve" ? "subscription_payment_approved" : "subscription_payment_rejected",
    entity_type: "business",
    entity_id: order.business_id,
    description:
      decision === "approve"
        ? `Approved ${order.currency} ${Number(order.total_amount).toFixed(2)} subscription payment.`
        : `Rejected ${order.currency} ${Number(order.total_amount).toFixed(2)} subscription payment.`,
    metadata: {
      subscription_order_id: order.id,
      order_kind: order.order_kind,
      plan_key: order.plan_key,
      term_months: order.term_months,
      requested_user_limit: order.requested_user_limit,
      total_amount: Number(order.total_amount),
      decision,
      review_note: reviewNote || null,
      new_expiry: row?.new_expiry ?? null,
    },
  });

  if (order.requested_by_user_id) {
    await supabaseAdmin.from("business_notifications").upsert(
      {
        business_id: order.business_id,
        notification_key: `subscription-review:${order.id}`,
        notification_type: "subscription_review",
        severity: decision === "approve" ? "success" : "warning",
        title:
          decision === "approve"
            ? order.order_kind === "reactivation"
              ? "Subscription reactivated"
              : order.order_kind === "upgrade"
                ? "Subscription upgraded"
                : order.order_kind === "renewal"
                  ? "Subscription renewed"
                  : "Subscription activated"
            : "Subscription payment rejected",
        message:
          decision === "approve"
            ? order.order_kind === "reactivation"
              ? "Your payment was approved. TENH POS access is reactivated on the paid plan; no new free trial is started."
              : order.order_kind === "upgrade"
                ? "Your payment was approved. The upgraded team limits and plan entitlements are now active."
                : "Your payment was approved and the TENH POS subscription is active."
            : reviewNote,
        href: `/dashboard/settings/subscription/payment/${order.id}`,
        target_roles: ["owner"],
        target_user_id: order.requested_by_user_id,
        source_table: "subscription_orders",
        source_id: order.id,
        occurred_at: new Date().toISOString(),
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id,notification_key" },
    );
  }

  revalidatePath("/super-admin/subscription-payments");
  revalidatePath("/super-admin/businesses");
  revalidatePath("/dashboard/settings/subscription");
  revalidatePath(`/dashboard/settings/subscription/payment/${order.id}`);
}
