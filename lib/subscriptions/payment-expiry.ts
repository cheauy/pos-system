import "server-only";

import { cancelSubscriptionPaywayCheckout } from "@/lib/payway/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PAYMENT_WINDOW_MS = 10 * 60 * 1000;

type PaymentExpiryOrder = {
  id: string;
  business_id: string;
  status: string;
  payment_provider?: string | null;
  payway_tran_id?: string | null;
  payment_expires_at?: string | null;
  payment_expired_at?: string | null;
  created_at?: string | null;
};

export function getSubscriptionPaymentExpiryAt(order: {
  payment_expires_at?: string | null;
  created_at?: string | null;
}) {
  if (order.payment_expires_at) return order.payment_expires_at;
  if (!order.created_at) return null;
  const createdAt = new Date(order.created_at).getTime();
  if (!Number.isFinite(createdAt)) return null;
  return new Date(createdAt + PAYMENT_WINDOW_MS).toISOString();
}

export function isSubscriptionPaymentExpired(order: {
  payment_expires_at?: string | null;
  created_at?: string | null;
}, now = Date.now()) {
  const value = getSubscriptionPaymentExpiryAt(order);
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export async function expireSubscriptionPaymentRequestSafely(args: {
  businessId: string;
  orderId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("subscription_orders")
    .select(
      "id,business_id,status,payment_provider,payway_tran_id,payment_expires_at,payment_expired_at,created_at",
    )
    .eq("id", args.orderId)
    .eq("business_id", args.businessId)
    .maybeSingle();

  if (error) throw new Error(`Unable to verify payment expiry: ${error.message}`);
  if (!data) throw new Error("Subscription payment request was not found.");

  const order = data as PaymentExpiryOrder;
  if (order.status !== "pending_payment") {
    return {
      state: order.payment_expired_at ? ("expired" as const) : ("not_pending" as const),
      orderId: order.id,
      status: order.status,
    };
  }

  if (!isSubscriptionPaymentExpired(order)) {
    return {
      state: "pending" as const,
      orderId: order.id,
      expiresAt: getSubscriptionPaymentExpiryAt(order),
    };
  }

  if (order.payment_provider === "aba_payway" && order.payway_tran_id) {
    try {
      const result = await cancelSubscriptionPaywayCheckout({
        orderId: order.id,
        businessId: order.business_id,
        reason: "payment_expired",
      });
      if (result.state === "approved") {
        return { state: "approved" as const, orderId: order.id };
      }
      if (result.state === "provider_close_unavailable") {
        return { state: "verification_required" as const, orderId: order.id, message: result.message };
      }
      return { state: "expired" as const, orderId: order.id };
    } catch (paymentError) {
      // Do not mark an external payment expired when PayWay's state is
      // uncertain. Leaving the TENH row pending is safer than taking payment
      // without activating it or allowing a duplicate second checkout.
      return {
        state: "verification_required" as const,
        orderId: order.id,
        message:
          paymentError instanceof Error
            ? paymentError.message
            : "ABA PayWay status could not be verified safely.",
      };
    }
  }

  const { data: result, error: expireError } = await supabaseAdmin.rpc(
    "expire_subscription_payment_order",
    {
      p_business_id: order.business_id,
      p_order_id: order.id,
    },
  );

  if (expireError) {
    throw new Error(`Unable to expire payment request: ${expireError.message}`);
  }

  const state =
    result && typeof result === "object" && "state" in result
      ? String((result as { state?: unknown }).state ?? "expired")
      : "expired";

  return {
    state: state === "pending" ? ("pending" as const) : ("expired" as const),
    orderId: order.id,
    expiresAt: getSubscriptionPaymentExpiryAt(order),
  };
}

export async function expireStaleSubscriptionPaymentRequestsForBusiness(
  businessId: string,
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("subscription_orders")
    .select("id")
    .eq("business_id", businessId)
    .eq("status", "pending_payment")
    .lte("payment_expires_at", nowIso)
    .order("payment_expires_at", { ascending: true })
    .limit(5);

  if (error) {
    throw new Error(`Unable to check expired payment requests: ${error.message}`);
  }

  for (const row of data ?? []) {
    try {
      await expireSubscriptionPaymentRequestSafely({
        businessId,
        orderId: row.id,
      });
    } catch {
      // A stale PayWay request must stay locked if its external status cannot
      // be resolved. The payment detail page will surface the same safe check.
    }
  }
}
