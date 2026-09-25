import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/tenancy/domain";

type PaywayEnvironment = "sandbox" | "live";
export type PaywayOrderKind = "subscription" | "business_change";

type SubscriptionPaywayOrder = {
  id: string;
  business_id: string;
  status: string;
  plan_key: string;
  term_months: number;
  total_amount: number | string | null;
  currency: string | null;
  payment_method: string | null;
  payment_provider?: string | null;
  proof_path?: string | null;
  manual_payment_reference?: string | null;
  manual_verified_at?: string | null;
  manual_verified_transaction_id?: string | null;
  pricing_locked_until: string | null;
  payment_expires_at?: string | null;
  payment_expired_at?: string | null;
  payway_tran_id?: string | null;
  payway_started_at?: string | null;
  payway_verified_at?: string | null;
};

type PaywayCheckResponse = {
  data?: {
    payment_status_code?: number | string;
    payment_status?: string;
    total_amount?: number | string;
    payment_amount?: number | string;
    payment_currency?: string;
    original_amount?: number | string;
    original_currency?: string;
    apv?: string;
    payment_type?: string;
    bank_ref?: string;
    payer_account?: string;
    transaction_date?: string;
  };
  status?: {
    code?: string | number;
    message?: string;
    tran_id?: string;
  };
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

function getEnvironment(): PaywayEnvironment {
  const value = clean(process.env.PAYWAY_ENV).toLowerCase();
  if (!value || value === "sandbox" || value === "test" || value === "testing") {
    return "sandbox";
  }
  if (value === "live" || value === "production" || value === "prod") {
    if (clean(process.env.PAYWAY_LIVE_ENABLED).toLowerCase() !== "true") {
      throw new Error("ABA PayWay live payments are disabled. Set PAYWAY_LIVE_ENABLED=true only after production approval.");
    }
    return "live";
  }
  throw new Error("PAYWAY_ENV must be sandbox or production.");
}

function validatedPaywayUrl(value: string, environment: PaywayEnvironment, label: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
  const expectedHost = environment === "sandbox"
    ? "checkout-sandbox.payway.com.kh"
    : "checkout.payway.com.kh";
  if (parsed.hostname !== expectedHost) {
    throw new Error(`${label} must use the official ${environment === "sandbox" ? "sandbox" : "production"} ABA PayWay host.`);
  }
  return parsed.toString();
}

function getAppOrigin() {
  const configured = clean(process.env.TENH_APP_URL) || getAppUrl("/");
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:") throw new Error("TENH_APP_URL must use HTTPS for ABA PayWay callbacks.");
  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("ABA PayWay requires a public whitelisted TENH_APP_URL. Use your HTTPS app domain instead of localhost.");
  }
  return parsed.origin;
}

export function getPaywayConfig() {
  const environment = getEnvironment();
  const merchantId = clean(process.env.PAYWAY_MERCHANT_ID);
  const apiKey = clean(process.env.PAYWAY_API_KEY);
  if (!merchantId) throw new Error("PAYWAY_MERCHANT_ID is not configured.");
  if (!apiKey) throw new Error("PAYWAY_API_KEY is not configured.");

  const defaultPurchase = environment === "sandbox"
    ? "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase"
    : "https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase";
  const defaultCheck = environment === "sandbox"
    ? "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2"
    : "https://checkout.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2";

  return {
    environment,
    merchantId,
    apiKey,
    purchaseUrl: validatedPaywayUrl(clean(process.env.PAYWAY_PURCHASE_URL) || defaultPurchase, environment, "PAYWAY_PURCHASE_URL"),
    checkTransactionUrl: validatedPaywayUrl(clean(process.env.PAYWAY_CHECK_TRANSACTION_URL) || defaultCheck, environment, "PAYWAY_CHECK_TRANSACTION_URL"),
    closeTransactionUrl: validatedPaywayUrl(
      clean(process.env.PAYWAY_CLOSE_TRANSACTION_URL) ||
        (environment === "sandbox"
          ? "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/close-transaction"
          : "https://checkout.payway.com.kh/api/payment-gateway/v1/payments/close-transaction"),
      environment,
      "PAYWAY_CLOSE_TRANSACTION_URL",
    ),
    appOrigin: getAppOrigin(),
  };
}

function utcRequestTime(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function hmacBase64(value: string, key: string) {
  return createHmac("sha512", key).update(value, "utf8").digest("base64");
}

function subscriptionTranId(orderId: string) {
  const compact = orderId.replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (compact.length < 18) throw new Error("Subscription order ID cannot be converted to an ABA PayWay transaction ID.");
  return `TP${compact.slice(0, 18)}`;
}

function exactAmount(value: number | string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0.5) throw new Error("Subscription payment amount is invalid.");
  return amount.toFixed(2);
}

function safeEmail(value: string | null | undefined) {
  const email = clean(value ?? undefined);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 50) : "";
}

export async function prepareSubscriptionPaywayCheckout(args: {
  kind?: PaywayOrderKind;
  orderId: string;
  businessId: string;
  email?: string | null;
}) {
  const businessChange = args.kind === "business_change";
  const table = businessChange ? "business_change_orders" : "subscription_orders";
  const columns:string = businessChange ? "id,business_id,status,credit_purchase,total_amount,currency,payment_method,payment_provider,proof_path,manual_payment_reference:payment_reference,payment_expires_at,payment_expired_at,payway_tran_id,payway_started_at,payway_verified_at" : "id,business_id,status,plan_key,term_months,total_amount,currency,payment_method,payment_provider,proof_path,manual_payment_reference,manual_verified_at,manual_verified_transaction_id,pricing_locked_until,payment_expires_at,payment_expired_at,payway_tran_id,payway_started_at,payway_verified_at";
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(columns)
    .eq("id", args.orderId)
    .eq("business_id", args.businessId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load subscription checkout: ${error.message}`);
  if (!data) throw new Error("Subscription order was not found.");
  const order = data as unknown as SubscriptionPaywayOrder;
  if (businessChange && !(data as unknown as {credit_purchase:boolean}).credit_purchase) throw new Error("Use the original manual checkout for this older order.");

  if (order.status === (businessChange ? "paid" : "approved") && order.payway_verified_at) {
    return { alreadyPaid: true as const, orderId: order.id };
  }
  if (order.status !== "pending_payment") {
    throw new Error("This subscription order is not waiting for payment.");
  }
  if (order.payment_expires_at) {
    const paymentExpiresAt = new Date(order.payment_expires_at).getTime();
    if (Number.isFinite(paymentExpiresAt) && paymentExpiresAt <= Date.now()) {
      throw new Error("This 10-minute payment request expired. Create a new payment request before starting ABA PayWay.");
    }
  }
  // A payment route is committed only when TENH has real payment evidence.
  // Older rows (and a previously interrupted Manual selection) can contain a
  // payment_method value even though no bank reference/proof/provider was ever
  // created. Those stale flags must not trap an otherwise fresh unpaid order.
  const hasManualEvidence = Boolean(
    order.manual_payment_reference ||
      order.proof_path ||
      order.manual_verified_at ||
      order.manual_verified_transaction_id,
  );
  const hasPaywayEvidence = Boolean(
    order.payment_provider === "aba_payway" || order.payway_tran_id,
  );
  const staleUncommittedMethod =
    Boolean(order.payment_method) &&
    !hasManualEvidence &&
    !hasPaywayEvidence;

  if (staleUncommittedMethod && !businessChange) {
    const staleMethod = order.payment_method;
    const { error: clearLegacyError } = await supabaseAdmin
      .from("subscription_orders")
      .update({ payment_method: null, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("business_id", args.businessId)
      .eq("status", "pending_payment")
      .eq("payment_method", staleMethod)
      .is("payment_provider", null)
      .is("payway_tran_id", null)
      .is("proof_path", null)
      .is("manual_payment_reference", null)
      .is("manual_verified_at", null)
      .is("manual_verified_transaction_id", null);

    if (clearLegacyError) {
      throw new Error(`Unable to repair the stale payment route: ${clearLegacyError.message}`);
    }
    order.payment_method = null;
  }

  if (hasManualEvidence && order.payment_provider !== "aba_payway") {
    throw new Error("Manual payment has already started for this order. Complete or cancel that transaction before starting ABA PayWay.");
  }
  if (order.payment_method && order.payment_provider !== "aba_payway") {
    throw new Error("This order has a committed payment route. Complete or cancel that transaction before starting ABA PayWay.");
  }
  if (order.pricing_locked_until) {
    const expires = new Date(order.pricing_locked_until).getTime();
    if (Number.isFinite(expires) && expires <= Date.now()) {
      throw new Error("This subscription price lock expired. Create a fresh order before paying.");
    }
  }

  const config = getPaywayConfig();
  const tranId = order.payway_tran_id || subscriptionTranId(order.id);
  const amount = exactAmount(order.total_amount);
  const currency = (order.currency || "USD").toUpperCase();
  if (currency !== "USD") throw new Error("TENH POS subscription checkout currently supports ABA PayWay in USD only.");

  const startedAt = order.payway_started_at || new Date().toISOString();
  let lockQuery = supabaseAdmin
    .from(table)
    .update({
      // PayWay is a provider route, not a legacy payment_method value. Clear
      // any stale method atomically when the PayWay transaction is locked.
      payment_method: null,
      payment_provider: "aba_payway",
      payway_tran_id: tranId,
      payway_started_at: startedAt,
      ...(businessChange ? {payment_expires_at: order.payment_expires_at || new Date(Date.now() + 10 * 60 * 1000).toISOString()} : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("business_id", args.businessId)
    .eq("status", "pending_payment");
  if (businessChange) lockQuery = lockQuery.is("proof_path", null).is("payment_reference", null).is("payment_method", null);
  const { data: saved, error: saveError } = await lockQuery
    .select("id")
    .maybeSingle();
  if (saveError || !saved) {
    throw new Error(saveError?.message ?? "Unable to lock this subscription order for ABA PayWay.");
  }

  const reqTime = utcRequestTime();
  const callbackUrl = `${config.appOrigin}/api/payway/${businessChange ? "business-change" : "subscription"}/callback`;
  const returnUrl = Buffer.from(callbackUrl, "utf8").toString("base64");
  const paymentPath = `/dashboard/settings/${businessChange ? "business" : "subscription"}/payment/${order.id}`;
  const continueSuccessUrl = `${config.appOrigin}${paymentPath}/payway-return`;
  const cancelUrl = `${config.appOrigin}${paymentPath}?payway=cancelled`;
  const returnParams = JSON.stringify({ order_id: order.id });
  const items = Buffer.from(JSON.stringify([
    { name: businessChange ? "TENH POS business change credits" : `TENH POS ${order.plan_key} subscription`, quantity: 1, price: Number(amount) },
  ]), "utf8").toString("base64");

  // PayWay requires the Purchase hash values in this exact documented order,
  // including empty optional fields. `view_type` and `payment_gate` are posted
  // but intentionally excluded from the hash. Keeping the full sequence here
  // avoids intermittent "invalid hash" checkout failures across merchant profiles.
  const email = safeEmail(args.email);
  const hashFields: Array<[string, string]> = [
    ["req_time", reqTime],
    ["merchant_id", config.merchantId],
    ["tran_id", tranId],
    ["amount", amount],
    ["items", items],
    ["shipping", "0.00"],
    ["firstname", "TENH"],
    ["lastname", "Customer"],
    ["email", email],
    ["phone", ""],
    ["type", "purchase"],
    ["payment_option", "abapay_khqr"],
    ["return_url", returnUrl],
    ["cancel_url", cancelUrl],
    ["continue_success_url", continueSuccessUrl],
    ["return_deeplink", ""],
    ["currency", currency],
    ["custom_fields", ""],
    ["return_params", returnParams],
    ["payout", ""],
    ["lifetime", ""],
    ["additional_params", ""],
    ["google_pay_token", ""],
    ["skip_success_page", ""],
  ];
  const hash = hmacBase64(hashFields.map(([, value]) => value).join(""), config.apiKey);

  return {
    alreadyPaid: false as const,
    purchaseUrl: config.purchaseUrl,
    fields: Object.fromEntries([
      ...hashFields,
      ["view_type", "popup"],
      ["payment_gate", "0"],
      ["hash", hash],
    ]),
    orderId: order.id,
    tranId,
  };
}

async function checkPaywayTransaction(tranId: string): Promise<PaywayCheckResponse> {
  const config = getPaywayConfig();
  const reqTime = utcRequestTime();
  const hash = hmacBase64(`${reqTime}${config.merchantId}${tranId}`, config.apiKey);
  const response = await fetch(config.checkTransactionUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ req_time: reqTime, merchant_id: config.merchantId, tran_id: tranId, hash }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`ABA PayWay status check failed (${response.status}).`);
  const payload = await response.json().catch(() => null) as PaywayCheckResponse | null;
  if (!payload || typeof payload !== "object") throw new Error("ABA PayWay returned an invalid status response.");
  return payload;
}

function approvedPaywayResponse(payload: PaywayCheckResponse) {
  const providerCode = String(payload.status?.code ?? "");
  const paymentCode = Number(payload.data?.payment_status_code);
  const paymentStatus = String(payload.data?.payment_status ?? "").toUpperCase();
  return providerCode === "00" && paymentCode === 0 && paymentStatus === "APPROVED";
}

export async function verifyAndConfirmSubscriptionPaywayPayment(args: {
  kind?: PaywayOrderKind;
  orderId?: string;
  tranId?: string;
  businessId?: string;
}) {
  const businessChange = args.kind === "business_change";
  const table = businessChange ? "business_change_orders" : "subscription_orders";
  if (!args.orderId && !args.tranId) throw new Error("ABA PayWay order reference is required.");
  let query = supabaseAdmin
    .from(table)
    .select("id,business_id,status,total_amount,currency,payment_provider,payway_tran_id,payway_verified_at,payment_expires_at,payment_expired_at");
  if (args.orderId) query = query.eq("id", args.orderId);
  if (args.tranId) query = query.eq("payway_tran_id", args.tranId);
  if (args.businessId) query = query.eq("business_id", args.businessId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Unable to load ABA PayWay subscription order: ${error.message}`);
  if (!data) throw new Error("ABA PayWay subscription order was not found.");

  const order = data as SubscriptionPaywayOrder;
  if (order.status === (businessChange ? "paid" : "approved") && order.payway_verified_at) {
    return { state: "approved" as const, orderId: order.id, alreadyConfirmed: true };
  }
  if (order.status !== "pending_payment") {
    return { state: "not_pending" as const, orderId: order.id, status: order.status };
  }
  if (order.payment_provider !== "aba_payway" || !order.payway_tran_id) {
    throw new Error("This subscription order is not locked to ABA PayWay.");
  }

  const payload = await checkPaywayTransaction(order.payway_tran_id);
  if (!approvedPaywayResponse(payload)) {
    return {
      state: "pending" as const,
      orderId: order.id,
      providerStatus: payload.data?.payment_status ?? payload.status?.message ?? "Pending",
    };
  }

  const providerAmount = Number(payload.data?.payment_amount ?? payload.data?.total_amount ?? payload.data?.original_amount);
  const expectedAmount = Number(order.total_amount);
  const providerCurrency = String(payload.data?.payment_currency ?? payload.data?.original_currency ?? "").toUpperCase();
  const expectedCurrency = String(order.currency ?? "USD").toUpperCase();
  if (!Number.isFinite(providerAmount) || Math.abs(providerAmount - expectedAmount) > 0.001) {
    throw new Error("ABA PayWay approved an amount that does not match this subscription order. The subscription was not activated.");
  }
  if (providerCurrency !== expectedCurrency) {
    throw new Error("ABA PayWay payment currency does not match this subscription order. The subscription was not activated.");
  }

  // Once TENH's payment window has ended, this order must never activate over a
  // newer subscription selection. If PayWay later reports the old transaction
  // as approved, preserve the payment for reconciliation/refund review instead.
  const paymentExpiresAt = order.payment_expires_at ? new Date(order.payment_expires_at).getTime() : Number.NaN;
  const paymentWindowEnded =
    Boolean(order.payment_expired_at) ||
    (Number.isFinite(paymentExpiresAt) && paymentExpiresAt <= Date.now());
  if (paymentWindowEnded) {
    const reviewedAt = new Date().toISOString();
    const { error: latePaymentError } = await supabaseAdmin
      .from(table)
      .update({
        status: "under_review",
        payment_expired_at: order.payment_expired_at ?? reviewedAt,
        payway_verified_at: reviewedAt,
        review_note:
          "ABA PayWay reported this transaction approved after the TENH payment window ended. Subscription was not activated; review this late payment before refund or manual resolution.",
        updated_at: reviewedAt,
      })
      .eq("id", order.id)
      .eq("business_id", order.business_id)
      .eq("status", "pending_payment")
      .eq("payment_provider", "aba_payway");

    if (latePaymentError) {
      throw new Error(`ABA PayWay payment was received after expiry, but TENH could not place it under review: ${latePaymentError.message}`);
    }

    return {
      state: "late_payment_review" as const,
      orderId: order.id,
      alreadyConfirmed: false,
    };
  }

  const { data: confirmed, error: confirmError } = await supabaseAdmin.rpc(businessChange ? "confirm_payway_business_change_order" : "confirm_payway_subscription_order", {
    p_business_id: order.business_id,
    p_order_id: order.id,
    p_tran_id: order.payway_tran_id,
    p_amount: providerAmount,
    p_currency: providerCurrency,
    p_apv: payload.data?.apv ?? null,
    p_payment_type: payload.data?.payment_type ?? null,
    p_bank_ref: payload.data?.bank_ref ?? null,
    p_payload: payload,
  });
  if (confirmError || !confirmed) {
    throw new Error(confirmError?.message ?? "ABA PayWay payment was verified but subscription confirmation failed. Refresh this order before paying again.");
  }
  return { state: "approved" as const, orderId: order.id, alreadyConfirmed: false, result: confirmed };
}

type PaywayCloseResponse = {
  status?: { code?: string | number; message?: string; tran_id?: string };
  httpStatus?: number;
  providerMessage?: string;
};

function paywayErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const payload = value as {
    message?: unknown;
    error?: unknown;
    status?: { message?: unknown };
  };
  const candidate = payload.status?.message ?? payload.message ?? payload.error;
  return typeof candidate === "string" ? candidate.trim().slice(0, 240) : "";
}

async function closePaywayTransaction(tranId: string): Promise<PaywayCloseResponse> {
  const config = getPaywayConfig();
  const reqTime = utcRequestTime();
  const hash = hmacBase64(`${reqTime}${config.merchantId}${tranId}`, config.apiKey);
  const response = await fetch(config.closeTransactionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      origin: config.appOrigin,
      referer: `${config.appOrigin}/`,
    },
    body: JSON.stringify({ req_time: reqTime, merchant_id: config.merchantId, tran_id: tranId, hash }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const raw = await response.text();
  let payload: PaywayCloseResponse | null = null;
  try {
    payload = raw ? (JSON.parse(raw) as PaywayCloseResponse) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ...(payload && typeof payload === "object" ? payload : {}),
      httpStatus: response.status,
      providerMessage: paywayErrorMessage(payload) || raw.trim().slice(0, 240) || response.statusText,
    };
  }
  if (!payload || typeof payload !== "object") {
    return {
      httpStatus: response.status,
      providerMessage: "ABA PayWay returned an invalid Close Transaction response.",
    };
  }
  return { ...payload, httpStatus: response.status };
}

export async function cancelSubscriptionPaywayCheckout(args: {
  kind?: PaywayOrderKind;
  orderId: string;
  businessId: string;
  reason?: "owner_cancelled" | "payment_expired";
}) {
  const businessChange = args.kind === "business_change";
  const table = businessChange ? "business_change_orders" : "subscription_orders";
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id,business_id,status,payment_provider,payway_tran_id,payway_verified_at,payment_expired_at")
    .eq("id", args.orderId)
    .eq("business_id", args.businessId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load ABA PayWay checkout: ${error.message}`);
  if (!data) throw new Error("ABA PayWay subscription order was not found.");
  const order = data as SubscriptionPaywayOrder;

  if (order.status === (businessChange ? "paid" : "approved") && order.payway_verified_at) {
    return { state: "approved" as const, orderId: order.id };
  }
  if (order.status === "cancelled") {
    return {
      state: order.payment_expired_at ? ("expired" as const) : ("cancelled" as const),
      orderId: order.id,
    };
  }
  if (order.status !== "pending_payment" || order.payment_provider !== "aba_payway" || !order.payway_tran_id) {
    throw new Error("This order does not have an active ABA PayWay checkout.");
  }

  // Never close a transaction that PayWay already considers approved.
  const checked = await checkPaywayTransaction(order.payway_tran_id);
  if (approvedPaywayResponse(checked)) {
    const confirmed = await verifyAndConfirmSubscriptionPaywayPayment({
      kind: args.kind,
      orderId: order.id,
      businessId: order.business_id,
    });
    if (confirmed.state !== "approved") {
      return {
        state: "provider_close_unavailable" as const,
        orderId: order.id,
        message: "This payment needs review. No replacement checkout was created. Check the payment order before paying again.",
      };
    }
    return { state: "approved" as const, orderId: confirmed.orderId };
  }

  const closed = await closePaywayTransaction(order.payway_tran_id);
  if (closed.httpStatus && (closed.httpStatus < 200 || closed.httpStatus >= 300)) {
    return {
      state: "provider_close_unavailable" as const,
      orderId: order.id,
      httpStatus: closed.httpStatus,
      message:
        closed.httpStatus === 401 || closed.httpStatus === 403
          ? "ABA PayWay did not authorize Close Transaction for this request. TENH kept the payment locked so it cannot be paid twice."
          : `ABA PayWay could not close this checkout (HTTP ${closed.httpStatus}). TENH kept the payment locked for safety.`,
      providerMessage: closed.providerMessage ?? null,
    };
  }
  if (String(closed.status?.code ?? "") !== "00") {
    return {
      state: "provider_close_unavailable" as const,
      orderId: order.id,
      httpStatus: closed.httpStatus ?? null,
      message: `ABA PayWay did not confirm cancellation (${closed.status?.message ?? closed.providerMessage ?? "unknown status"}). TENH kept the payment locked for safety.`,
      providerMessage: closed.providerMessage ?? closed.status?.message ?? null,
    };
  }

  const cancelledAt = new Date().toISOString();
  const paymentExpired = args.reason === "payment_expired";
  const { data: cancelled, error: cancelError } = await supabaseAdmin
    .from(table)
    .update({
      status: "cancelled",
      cancelled_at: cancelledAt,
      payment_expired_at: paymentExpired ? cancelledAt : null,
      review_note: paymentExpired
        ? "ABA PayWay payment request expired after the 10-minute checkout window. The external transaction was verified unpaid and closed safely."
        : "ABA PayWay checkout cancelled safely before creating another subscription order.",
      updated_at: cancelledAt,
    })
    .eq("id", order.id)
    .eq("business_id", order.business_id)
    .eq("status", "pending_payment")
    .eq("payment_provider", "aba_payway")
    .select("id,status")
    .maybeSingle();

  if (cancelError) throw new Error(`ABA PayWay was closed, but TENH could not record the cancellation: ${cancelError.message}`);
  if (!cancelled) {
    // A callback may have won the race. Re-read before deciding what happened.
    const { data: latest } = await supabaseAdmin
      .from(table)
      .select("status,payway_verified_at")
      .eq("id", order.id)
      .maybeSingle();
    if (latest?.status === (businessChange ? "paid" : "approved") && latest.payway_verified_at) {
      return { state: "approved" as const, orderId: order.id };
    }
    throw new Error("TENH could not safely confirm cancellation. Check this payment order before paying again.");
  }

  return {
    state: paymentExpired ? ("expired" as const) : ("cancelled" as const),
    orderId: order.id,
  };
}

export function verifyPaywayCallbackSignature(rawPayload: Record<string, unknown>, receivedSignature: string | null) {
  if (!receivedSignature) return false;
  const { apiKey } = getPaywayConfig();
  const values = Object.keys(rawPayload)
    .sort()
    .map((key) => {
      const value = rawPayload[key];
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    })
    .join("");
  const expected = hmacBase64(values, apiKey);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(receivedSignature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
