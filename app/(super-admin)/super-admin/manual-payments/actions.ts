"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BusinessChangeReviewState } from "./state";

const ALLOWED_REJECTION_MESSAGES = new Set([
  "We could not verify this payment. Please check the payment and submit a clear payment proof again.",
  "The payment proof is unclear or incomplete. Please upload a clear payment proof and submit again.",
  "The payment amount or payment details do not match this request. Please correct the payment information and submit again.",
]);

export async function reviewBusinessChangePayment(
  _previousState: BusinessChangeReviewState,
  formData: FormData,
): Promise<BusinessChangeReviewState> {
  try {
    const admin = await requireSuperAdmin();
    const orderIdValue = formData.get("orderId");
    const decisionValue = formData.get("decision");
    const reviewNoteValue = formData.get("reviewNote");

    const orderId =
      typeof orderIdValue === "string" ? orderIdValue.trim() : "";
    const decision =
      decisionValue === "approve" || decisionValue === "reject"
        ? decisionValue
        : null;
    const reviewNote =
      typeof reviewNoteValue === "string" ? reviewNoteValue.trim() : "";

    if (!orderId) {
      throw new Error("Payment request ID is required.");
    }

    if (!decision) {
      throw new Error("Choose Approve or Reject.");
    }

    if (reviewNote.length > 1000) {
      throw new Error("Review note must be 1,000 characters or fewer.");
    }

    if (decision === "reject" && !ALLOWED_REJECTION_MESSAGES.has(reviewNote)) {
      throw new Error("Select one of the approved rejection messages.");
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("business_change_orders")
      .select(
        "id,business_id,credit_purchase,requested_by_user_id,status,payment_note,proof_bucket,proof_path,total_amount,currency,change_url,change_business_mode,old_slug,requested_slug,old_business_type,requested_business_type",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      throw new Error(`Unable to load payment request: ${orderError.message}`);
    }

    if (!order) {
      throw new Error("Payment request was not found.");
    }

    if (["applied","paid"].includes(order.status) && decision === "approve") {
      return {
        success: true,
        message: "This payment was already approved.",
        reviewedAt: Date.now(),
      };
    }

    if (order.status !== "payment_submitted") {
      throw new Error(
        "Only a customer-submitted payment can be manually reviewed. Refresh the queue and try again.",
      );
    }

    if (decision === "approve" && !order.payment_note?.trim()) {
      throw new Error("This customer has not submitted the required payment note.");
    }

    if (decision === "approve" && (!order.proof_bucket || !order.proof_path)) {
      throw new Error("This customer has not uploaded payment proof yet.");
    }

    const { data: result, error: reviewError } = await supabaseAdmin.rpc(
      "review_business_change_order",
      {
        p_order_id: order.id,
        p_decision: decision,
        p_admin_user_id: admin.id,
        p_admin_email: admin.email,
        p_review_note: reviewNote || null,
      },
    );

    if (reviewError) {
      throw new Error(reviewError.message);
    }

    const action = decision === "approve" ? "business_change_payment_approved" : "business_change_payment_rejected";
    const description =
      decision === "approve"
        ? `Super Admin approved a ${order.currency} ${Number(order.total_amount).toFixed(2)} business-change payment.`
        : `Super Admin rejected a ${order.currency} ${Number(order.total_amount).toFixed(2)} business-change payment.`;

    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      business_id: order.business_id,
      user_id: admin.id,
      action,
      entity_type: "business",
      entity_id: order.business_id,
      description,
      metadata: {
        change_order_id: order.id,
        decision,
        payment_note_length: order.payment_note?.length ?? 0,
        payment_proof_uploaded: Boolean(order.proof_bucket && order.proof_path),
        review_note: reviewNote || null,
        change_url: order.change_url,
        change_business_mode: order.change_business_mode,
        old_slug: order.old_slug,
        requested_slug: order.requested_slug,
        old_business_type: order.old_business_type,
        requested_business_type: order.requested_business_type,
        amount: Number(order.total_amount),
        currency: order.currency,
        reviewed_by: admin.email,
      },
    });

    if (auditError) {
      console.error(
        "Unable to create manual business-change payment audit log:",
        auditError.message,
      );
    }

    let notificationWarning: string | null = null;

    if (order.requested_by_user_id) {
      const notificationTitle =
        decision === "approve"
          ? order.credit_purchase ? "Business change credits available" : "Business change approved"
          : "Business change payment rejected";
      const notificationMessage =
        decision === "approve"
          ? order.credit_purchase ? "Your payment was approved. Purchased change credits are available in Business Details and never expire." : "Your payment was approved and the requested TENH POS business changes were applied."
          : reviewNote;

      const { error: notificationError } = await supabaseAdmin
        .from("business_notifications")
        .upsert(
          {
            business_id: order.business_id,
            notification_key: `business-change-review:${order.id}`,
            notification_type: "business_change_review",
            severity: decision === "approve" ? "success" : "warning",
            title: notificationTitle,
            message: notificationMessage,
            href: `/dashboard/settings/business/payment/${order.id}`,
            target_roles: ["owner"],
            target_user_id: order.requested_by_user_id,
            source_table: "business_change_orders",
            source_id: order.id,
            occurred_at: new Date().toISOString(),
            is_active: true,
            metadata: {
              change_order_id: order.id,
              decision,
              amount: Number(order.total_amount),
              currency: order.currency,
              review_note: reviewNote || null,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "business_id,notification_key" },
        );

      if (notificationError) {
        notificationWarning =
          "The payment review was saved, but the submitting owner notification could not be created.";
        console.error(
          "Unable to create submitting-owner business-change notification:",
          notificationError.message,
        );
      }
    } else {
      notificationWarning =
        "The payment review was saved, but this older request has no submitting-owner user ID to notify.";
    }

    revalidatePath("/super-admin/manual-payments");
    revalidatePath("/super-admin/businesses");
    revalidatePath(`/super-admin/businesses/${order.business_id}`);
    revalidatePath(`/dashboard/settings/business/payment/${order.id}`);
    revalidatePath("/dashboard/settings/business");
    revalidatePath("/dashboard/settings");

    const rpcRow = Array.isArray(result) ? result[0] : result;
    const status = rpcRow?.order_status ?? (decision === "approve" ? "applied" : "cancelled");

    const baseMessage =
      decision === "approve"
        ? status === "applied"
          ? "Payment approved. The requested TENH POS business changes were applied and the submitting owner was notified."
          : "Payment approved and the submitting owner was notified."
        : "Payment rejected. The current business URL and mode were not changed, and the submitting owner was notified.";

    return {
      success: true,
      message: notificationWarning
        ? `${baseMessage} ${notificationWarning}`
        : baseMessage,
      reviewedAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to review this manual payment.",
      reviewedAt: Date.now(),
    };
  }
}
