import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";

import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSubscriptionPlanLabel } from "@/lib/subscriptions/plans";
import { getManualPaymentConfig } from "@/lib/subscriptions/manual-bank";
import {
  expireSubscriptionPaymentRequestSafely,
  getSubscriptionPaymentExpiryAt,
} from "@/lib/subscriptions/payment-expiry";
import PaymentRequestCountdown from "../../payment-request-countdown";
import CopyPaymentValue from "../../copy-payment-value";
import ExpiredPaymentRedirect from "../../expired-payment-redirect";
import ManualPaymentStatusWatcher from "../../manual-payment-status-watcher";
import ManualPaymentQrPreview from "../../manual-payment-qr-preview";
import ManualPaymentProofForm from "./manual-payment-proof-form";
import {
  cancelPendingSubscriptionPayment,
  changePendingUpgradeDuration,
  selectSubscriptionPaymentMethod,
} from "../../actions";

type PaymentMethod = "manual";

type SubscriptionOrder = {
  id: string;
  order_kind: string;
  plan_key: string;
  requested_user_limit: number;
  requested_branch_limit?: number;
  base_plan_key?: string;
  current_plan_key?: string | null;
  current_user_limit?: number | null;
  current_branch_limit?: number | null;
  term_months: number;
  monthly_price: number | string | null;
  discount_percent: number | string;
  subtotal_amount: number | string | null;
  term_price_amount: number | string | null;
  remaining_credit_amount: number | string | null;
  total_amount: number | string | null;
  upgrade_prorated_amount?: number | string | null;
  extension_amount?: number | string | null;
  currency: string;
  status: string;
  payment_method: string | null;
  payment_provider?: string | null;
  payway_tran_id?: string | null;
  payway_verified_at?: string | null;
  payway_payment_type?: string | null;
  payment_note: string | null;
  proof_file_name: string | null;
  proof_path?: string | null;
  review_note: string | null;
  pricing_locked_until: string | null;
  payment_expires_at?: string | null;
  payment_expired_at?: string | null;
  manual_payment_reference?: string | null;
  manual_bank_name?: string | null;
  manual_account_name?: string | null;
  manual_account_number?: string | null;
  manual_qr_image_url?: string | null;
  manual_verified_at?: string | null;
  manual_verified_transaction_id?: string | null;
  manual_late_payment_at?: string | null;
  effective_at: string | null;
  activated_at: string | null;
  pricing_version?: number;
  created_at: string;
};

function money(value: number | string | null) {
  if (value === null) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function orderKindLabel(kind: string) {
  switch (kind) {
    case "reactivation":
      return "Reactivation";
    case "upgrade":
      return "Upgrade";
    case "renewal":
      return "Renewal";
    default:
      return "Activation";
  }
}

function statusLabel(order: SubscriptionOrder) {
  if (order.payment_expired_at) return "Payment expired";
  const status = order.status;
  switch (status) {
    case "quote_requested":
      return "Quote requested";
    case "pending_payment":
      return "Payment required";
    case "payment_submitted":
      return "Payment under review";
    case "approved":
      return order.activated_at ? "Subscription activated" : "Payment approved";
    case "rejected":
      return "Payment rejected";
    default:
      return status.replace(/_/g, " ");
  }
}

function paymentMethodLabel(method: PaymentMethod | null, provider?: string | null) {
  if (provider === "aba_payway") return "ABA PayWay";
  if (method === "manual") return "Manual payment";
  return "Choose payment method";
}

function durationLabel(months: number, prefix = false) {
  if (months === 0) return "Choose duration";
  const label = months === 12 ? "1 year" : months === 1 ? "1 month" : `${months} months`;
  return prefix ? `+${label}` : label;
}

export default async function SubscriptionPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<{ method?: string; switch?: string; manual?: string }>;
}) {
  // Paid checkout must not start a pending free trial implicitly.
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  const { orderId } = await params;
  const query = searchParams ? await searchParams : {};

  // Server-authoritative expiry. For PayWay this verifies payment first and
  // closes an unpaid transaction before the TENH order is marked expired.
  try {
    await expireSubscriptionPaymentRequestSafely({ businessId: business.id, orderId });
  } catch {
    // Keep the order locked instead of failing the page when an external
    // payment status cannot be resolved safely at this moment.
  }

  const { data, error } = await supabaseAdmin
    .from("subscription_orders")
    .select("*")
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error || !data) notFound();
  const order = data as SubscriptionOrder;

  const manualConfig = getManualPaymentConfig();
  const manualBankName = order.manual_bank_name || manualConfig.bankName;
  const manualAccountName = order.manual_account_name || manualConfig.accountName;
  const manualAccountNumber =
    order.manual_account_number || manualConfig.accountNumber;
  const manualQrImageUrl =
    order.manual_qr_image_url === "/images/manual-payment-qr.jpg"
      ? "/manual-payment-qr.jpg"
      : order.manual_qr_image_url || manualConfig.qrImageUrl;
  const manualSnapshotReady = Boolean(
    manualBankName && manualAccountName && manualAccountNumber,
  );
  const manualRouteCommitted = order.payment_method === "manual";
  const manualOptionVisible =
    manualConfig.requestedEnabled ||
    manualConfig.enabled ||
    order.payment_method === "manual";
  const manualOptionAvailable =
    manualConfig.enabled ||
    (order.payment_method === "manual" && manualSnapshotReady);

  const paymentExpired = Boolean(order.payment_expired_at);
  const pending = order.status === "pending_payment" && !paymentExpired;
  const submitted = order.status === "payment_submitted";
  const approved = order.status === "approved";
  const rejected = order.status === "rejected";
  const quoteRequested = order.status === "quote_requested";
  const scheduledForTermEnd =
    order.order_kind === "renewal" &&
    Boolean(order.effective_at) &&
    !order.activated_at;
  const effectiveLabel = order.effective_at
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Phnom_Penh",
      }).format(new Date(order.effective_at))
    : null;
  const priceExpired =
    pending &&
    order.pricing_locked_until !== null &&
    new Date(order.pricing_locked_until).getTime() <= Date.now();
  const paymentExpiresAt = getSubscriptionPaymentExpiryAt(order);
  const paymentRemainingSeconds = paymentExpiresAt
    ? Math.max(0, Math.ceil((new Date(paymentExpiresAt).getTime() - Date.now()) / 1000))
    : 0;
  const creditAmount = Number(order.remaining_credit_amount ?? 0);
  const hasCredit = Number.isFinite(creditAmount) && creditAmount > 0;
  const paymentMethod: PaymentMethod | null =
    manualRouteCommitted ? "manual" : null;
  const paymentProvider = order.payment_provider === "aba_payway" ? "aba_payway" : null;
  const usingPayway = paymentProvider === "aba_payway";
  const paywaySelected =
    pending &&
    !usingPayway &&
    query.method === "payway";
  const manualSelected =
    pending &&
    !usingPayway &&
    !paywaySelected &&
    paymentMethod === "manual";
  const manualModalOpen = manualSelected && query.manual !== "closed";
  const upgradeProration = Number(order.upgrade_prorated_amount ?? 0);
  const hasUpgradeProration = Number.isFinite(upgradeProration) && upgradeProration > 0;
  const termSubtotalValue = Number(order.subtotal_amount ?? 0);
  const safeTermSubtotal = Number.isFinite(termSubtotalValue) ? Math.max(0, termSubtotalValue) : 0;
  const termPriceValue = Number(order.term_price_amount ?? 0);
  const safeTermPrice = Number.isFinite(termPriceValue) ? Math.max(0, termPriceValue) : 0;
  const discountPercent = Number(order.discount_percent ?? 0);
  const safeDiscountPercent = Number.isFinite(discountPercent) ? Math.max(0, discountPercent) : 0;
  const termDiscountAmount = Math.max(0, safeTermSubtotal - safeTermPrice);
  const planItemPrice =
    order.order_kind === "upgrade"
      ? Math.max(0, Number.isFinite(upgradeProration) ? upgradeProration : 0)
      : safeTermSubtotal;
  const checkoutSubtotal =
    planItemPrice + (order.order_kind === "upgrade" && order.term_months > 0 ? safeTermSubtotal : 0);
  const branchCount = order.requested_branch_limit ?? 1;
  const canChangeUpgradeDuration =
    pending &&
    !priceExpired &&
    (order.order_kind === "upgrade" || order.order_kind === "reactivation") &&
    !order.payment_method &&
    !order.payment_provider &&
    !order.payway_tran_id &&
    !order.proof_path;
  // `base_plan_key` describes the target configuration (especially Custom
  // plans), not the customer's current subscription. The safe quote stores the
  // authoritative current plan snapshot in `current_plan_key`. Using that
  // avoids showing Small Team as the current plan while Settings correctly
  // shows Solo.
  const currentPlanLabel = order.current_plan_key
    ? getSubscriptionPlanLabel(order.current_plan_key)
    : "Current plan";
  const selectedPlanLabel = getSubscriptionPlanLabel(order.plan_key);

  return (
    <main className="mx-auto w-full max-w-[1540px] pb-10">
      {manualRouteCommitted && (pending || submitted) ? (
        <ManualPaymentStatusWatcher orderId={order.id} />
      ) : null}

      <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Link
            href="/dashboard/settings/subscription"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft size={16} />
            Back to subscription
          </Link>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
            Checkout
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review your {order.order_kind === "upgrade" ? "upgrade" : "subscription"} and complete payment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
          <CheckoutStep number="1" label="Details" state="complete" />
          <span className="h-px w-6 bg-slate-200 dark:bg-slate-700" />
          <CheckoutStep number="2" label="Payment" state="active" />
          <span className="h-px w-6 bg-slate-200 dark:bg-slate-700" />
          <CheckoutStep number="3" label="Confirmation" state="upcoming" />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Order <span className="font-extrabold text-slate-800 dark:text-slate-200">#{order.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pending ? (
            <form action={cancelPendingSubscriptionPayment}>
              <input type="hidden" name="orderId" value={order.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-300"
              >
                <XCircle size={14} />
                Cancel transaction
              </button>
            </form>
          ) : null}
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
              approved
                ? "bg-emerald-50 text-emerald-700"
                : rejected || paymentExpired
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {approved ? (
              <CheckCircle2 size={14} />
            ) : rejected || paymentExpired ? (
              <XCircle size={14} />
            ) : (
              <Clock3 size={14} />
            )}
            {statusLabel(order)}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <ReceiptText size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950 dark:text-white">Order summary</h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Review the subscription items before choosing a payment method.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              {orderKindLabel(order.order_kind)}
            </span>
          </div>

          {order.order_kind === "upgrade" ? (
            <div className="mt-5 grid items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-slate-50 p-4 dark:border-blue-900 dark:from-blue-950/25 dark:to-slate-950 sm:grid-cols-[1fr_auto_1fr]">
              <PlanSnapshot
                eyebrow="Current plan"
                plan={currentPlanLabel}
                detail={
                  order.current_user_limit
                    ? `${order.current_user_limit} ${order.current_user_limit === 1 ? "user" : "users"} · ${Math.max(1, order.current_branch_limit ?? 1)} ${Math.max(1, order.current_branch_limit ?? 1) === 1 ? "branch" : "branches"}`
                    : "Your current paid subscription"
                }
                icon={<FileText size={18} />}
              />
              <ArrowRight className="mx-auto hidden text-slate-400 sm:block" size={20} />
              <PlanSnapshot
                eyebrow="New plan"
                plan={selectedPlanLabel}
                detail={`${order.requested_user_limit} ${order.requested_user_limit === 1 ? "user" : "users"} · ${branchCount} ${branchCount === 1 ? "branch" : "branches"}`}
                icon={<UsersRound size={18} />}
                accent
              />
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
              <PlanSnapshot
                eyebrow="Selected plan"
                plan={selectedPlanLabel}
                detail={`${order.requested_user_limit} ${order.requested_user_limit === 1 ? "user" : "users"} · ${branchCount} ${branchCount === 1 ? "branch" : "branches"}`}
                icon={<UsersRound size={18} />}
                accent
              />
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="hidden grid-cols-[minmax(0,.95fr)_minmax(0,1.5fr)_auto] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400 dark:border-slate-700 dark:bg-slate-950 sm:grid">
              <span>Item</span>
              <span>Details</span>
              <span className="text-right">Price</span>
            </div>

            <CheckoutItemRow
              icon={<UsersRound size={18} />}
              item={`${selectedPlanLabel} ${order.order_kind === "upgrade" ? "upgrade" : "subscription"}`}
              detail={
                <>
                  <span>{order.requested_user_limit} {order.requested_user_limit === 1 ? "user" : "users"} · {branchCount} {branchCount === 1 ? "branch" : "branches"}</span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {order.order_kind === "upgrade"
                      ? hasUpgradeProration
                        ? "Added capacity for the remaining paid term"
                        : "Selected subscription capacity"
                      : `${durationLabel(order.term_months)} · Monthly rate ${money(order.monthly_price)}`}
                  </span>
                </>
              }
              price={money(planItemPrice)}
            />

            {order.order_kind === "upgrade" ? (
              <CheckoutItemRow
                icon={<CalendarDays size={18} />}
                item="Billing term"
                detail={
                  <>
                    <span>
                      {order.term_months === 0
                        ? "Keep current expiry"
                        : `Add ${durationLabel(order.term_months)} after the current paid expiry`}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {order.term_months === 0
                        ? "No additional billing term is added"
                        : `Monthly rate ${money(order.monthly_price)}${safeDiscountPercent > 0 ? ` · ${safeDiscountPercent.toFixed(0)}% term discount` : ""}`}
                    </span>
                  </>
                }
                price={order.term_months > 0 ? money(safeTermSubtotal) : "$0.00"}
              />
            ) : null}
          </div>

          {order.order_kind === "upgrade" || order.order_kind === "reactivation" ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-extrabold text-blue-950 dark:text-blue-100">Billing Term</p>
                  <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">{order.order_kind === "reactivation" ? `Selected: ${durationLabel(order.term_months)}. Your previous term is selected automatically; you can change it before payment.` : "Keep your current expiry or add a new billing term after it."}</p>
                </div>
                {!canChangeUpgradeDuration ? (
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Locked after payment starts</p>
                ) : null}
              </div>
              <form action={changePendingUpgradeDuration} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input type="hidden" name="orderId" value={order.id} />
                {[
                  { value: 0, label: "Keep current" },
                  { value: 1, label: "Add 1 month" },
                  { value: 3, label: "Add 3 months" },
                  { value: 6, label: "Add 6 months" },
                  { value: 12, label: "Add 1 year" },
                ].filter((option) => order.order_kind === "upgrade" || option.value > 0).map((option) => {
                  const active = order.term_months === option.value;
                  return (
                    <button
                      key={option.value}
                      type="submit"
                      name="termMonths"
                      value={option.value}
                      disabled={!canChangeUpgradeDuration || active}
                      aria-pressed={active}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-extrabold transition disabled:cursor-default ${
                        active
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-blue-200 bg-white text-blue-700 hover:border-blue-400 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/50"
                      }`}
                    >
                      {order.order_kind === "reactivation" ? option.label.replace("Add ", "") : option.label}
                    </button>
                  );
                })}
              </form>
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-1 dark:border-slate-700 dark:bg-slate-950/50">
            <CheckoutTotalRow label="Subtotal" value={money(checkoutSubtotal)} />
            <CheckoutTotalRow
              label={`Discount (${safeDiscountPercent.toFixed(0)}%)`}
              value={termDiscountAmount > 0 ? `-${money(termDiscountAmount)}` : "$0.00"}
            />
            {hasCredit ? (
              <CheckoutTotalRow label="Subscription credit" value={`-${money(creditAmount)}`} />
            ) : null}
            <CheckoutTotalRow label="Tax (0%)" value="$0.00" />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white px-5 py-4 dark:border-blue-900 dark:from-blue-950/30 dark:to-slate-900">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">Total due</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">One-time payment · USD</p>
            </div>
            <p className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">{money(order.total_amount)}</p>
          </div>

          {scheduledForTermEnd && effectiveLabel ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              Your current paid access stays unchanged until {effectiveLabel}. The selected plan applies then. If the selected limits are lower than current usage, excess users and branches are disabled, never deleted. Owner and Main Branch stay protected.
            </div>
          ) : null}

          {rejected && order.review_note ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800">
              {order.review_note}
            </div>
          ) : null}
        </section>

        <aside className="self-start rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 xl:sticky xl:top-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Payment method</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Choose how you want to pay for this order.</p>
            </div>
          </div>

          {quoteRequested ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
              TENH is preparing the custom monthly quote. Return after the quote is ready to choose a payment method.
            </div>
          ) : approved ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
              {scheduledForTermEnd && effectiveLabel
                ? `Payment verified. Your current paid access stays unchanged until ${effectiveLabel}; the selected plan applies then.`
                : !order.activated_at
                  ? "Payment verified. TENH is applying the selected subscription safely; no second payment is needed."
                  : "Payment verified. Your subscription is active and the selected plan entitlements are applied."}
            </div>
          ) : submitted ? (
            <>
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                {scheduledForTermEnd && effectiveLabel
                  ? `Payment proof submitted. Our team will verify it. If approved, your current paid access stays unchanged until ${effectiveLabel}.`
                  : "Payment proof submitted. Our team will verify it before activating the subscription."}
              </div>
              <div className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                <p className="font-bold text-slate-900 dark:text-white">Taking longer than expected?</p>
                <p>
                  Contact{" "}
                  <a
                    href="https://t.me/tenhchat_support_bot"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    TENH Support
                  </a>{" "}
                  for payment verification assistance.
                </p>
              </div>
            </>
          ) : paymentExpired ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              <p className="font-bold">Payment request expired</p>
              {order.payment_expired_at ? <ExpiredPaymentRedirect expiredAt={order.payment_expired_at} /> : null}
              <Link
                href="/dashboard/settings/subscription?view=plans"
                className="mt-3 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white hover:bg-blue-700"
              >
                Choose Subscription
              </Link>
            </div>
          ) : rejected ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
              This payment was rejected. Create a new subscription order after correcting the payment.
            </div>
          ) : pending && priceExpired ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              This price lock expired before payment was submitted. Return to Subscription and create a fresh order.
              <Link
                href="/dashboard/settings/subscription?view=plans"
                className="mt-3 inline-flex font-bold text-blue-700 hover:text-blue-800"
              >
                Create fresh subscription order
              </Link>
            </div>
          ) : pending ? (
            <>
              {paymentExpiresAt ? (
                <PaymentRequestCountdown
                  orderId={order.id}
                  expiresAt={paymentExpiresAt}
                  initialRemainingSeconds={paymentRemainingSeconds}
                  variant="panel"
                />
              ) : null}

              {query.switch === "payway_close_unavailable" ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  ABA PayWay could not safely close the current transaction yet. TENH kept it locked to prevent duplicate payment.
                </div>
              ) : query.switch === "payway_status_unavailable" ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  TENH could not confirm the ABA PayWay status right now. No payment method was changed.
                </div>
              ) : null}

              {usingPayway ? (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                  <p className="text-sm font-extrabold text-blue-900 dark:text-blue-200">ABA PayWay checkout started</p>
                  <p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-300">
                    This order is locked to one PayWay transaction to prevent duplicate charges.
                  </p>
                  <div className={`mt-3 grid gap-2 ${manualOptionAvailable ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                    <Link
                      href={`/dashboard/settings/subscription/payment/${order.id}/payway-return`}
                      className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      Check payment status
                    </Link>
                    {manualOptionAvailable ? (
                      <form action={selectSubscriptionPaymentMethod}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="paymentMethod" value="manual" />
                        <button
                          type="submit"
                          className="inline-flex w-full items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
                        >
                          Switch to Manual
                        </button>
                      </form>
                    ) : null}
                    <form action={cancelPendingSubscriptionPayment}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <button
                        type="submit"
                        className="inline-flex w-full items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
                      >
                        Cancel payment
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-4 grid gap-2">
                    <PaywayMethodButton
                      orderId={order.id}
                      active={paywaySelected}
                      disabled={false}
                    />
                    {manualOptionVisible ? (
                      <PaymentMethodButton
                        orderId={order.id}
                        method="manual"
                        active={manualSelected}
                        title="Manual payment"
                        description={manualOptionAvailable ? "Transfer by bank or other supported method" : "Manual payment setup is incomplete"}
                        icon={<CreditCard size={19} />}
                        disabled={!manualOptionAvailable}
                      />
                    ) : null}
                  </div>

                  {manualConfig.requestedEnabled && !manualConfig.enabled ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      Manual payment is enabled, but the bank setup is incomplete.
                    </div>
                  ) : null}
                </>
              )}

              {!usingPayway ? (
                <div className="mt-4 grid gap-2">
                  <CheckoutInfo icon={<ShieldCheck size={17} />} title="Secure checkout" description="Your payment information is handled safely." />
                  <CheckoutInfo icon={<FileText size={17} />} title="Payment proof" description="Manual payment requires proof before you can submit. Upload your receipt." />
                </div>
              ) : null}

              {!usingPayway && paywaySelected ? (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                  <p className="text-sm font-extrabold text-blue-900 dark:text-blue-200">ABA PayWay selected</p>
                  <p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-300">Review the total, then continue to secure checkout.</p>
                  <div className="mt-4 border-t border-blue-200 pt-4 dark:border-blue-900">
                    <Link
                      href={`/dashboard/settings/subscription/payment/${order.id}/payway`}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      Checkout with ABA PayWay
                      <ArrowRight size={17} />
                    </Link>
                  </div>
                </div>
              ) : null}

              {!usingPayway && manualSelected ? (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs font-semibold leading-5 text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
                  Manual Bank Transfer is selected. Click the Manual payment card again to reopen the transfer and receipt popup.
                </div>
              ) : null}

            </>
          ) : null}
        </aside>
      </div>

      {manualModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-bank-transfer-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                  <Building2 size={20} />
                </div>
                <div>
                  <h2 id="manual-bank-transfer-title" className="text-xl font-black text-slate-950 dark:text-white">
                    Manual Bank Transfer
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Transfer the exact amount, upload your receipt, then submit it for review.
                  </p>
                </div>
              </div>
              <Link
                href={`/dashboard/settings/subscription/payment/${order.id}?manual=closed`}
                aria-label="Close Manual Bank Transfer"
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={20} />
              </Link>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              {manualQrImageUrl ? (
                <div className="mb-4 flex justify-center">
                  <ManualPaymentQrPreview imageUrl={manualQrImageUrl} />
                </div>
              ) : null}
              <ManualPaymentRow label="Bank" value={manualBankName || "—"} />
              <ManualPaymentRow label="Account name" value={manualAccountName || "—"} />
              <ManualPaymentRow
                label="Account number"
                value={manualAccountNumber || "—"}
                copyValue={manualAccountNumber || undefined}
              />
              <ManualPaymentRow
                label="Amount"
                value={`${money(order.total_amount)} ${order.currency || "USD"}`}
                copyValue={Number(order.total_amount ?? 0).toFixed(2)}
                highlight
              />
            </div>

            <ManualPaymentProofForm
              orderId={order.id}
              initialProofFileName={order.proof_file_name}
              initialNote={order.payment_note}
            />
          </section>
        </div>
      ) : null}
    </main>
  );
}


function PaywayMethodButton({
  orderId,
  active,
  disabled,
}: {
  orderId: string;
  active: boolean;
  disabled: boolean;
}) {
  const className = `flex min-h-[72px] w-full items-center rounded-2xl border p-3.5 text-left transition ${
    active
      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500 dark:bg-blue-950/30 dark:text-blue-300"
      : disabled
        ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
        : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
  }`;

  const content = (
    <span className="flex w-full items-center gap-3">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>
        {active ? <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
      </span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aba-khqr.png" alt="ABA PayWay" className="h-8 w-8 rounded-lg object-contain" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">ABA PayWay</span>
        <span className="mt-0.5 block text-xs font-medium opacity-75">Secure online checkout</span>
      </span>
    </span>
  );

  if (disabled) {
    return (
      <div className={className} aria-disabled="true" title="ABA PayWay is not available for this payment state.">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/dashboard/settings/subscription/payment/${orderId}?method=payway`}
      className={className}
    >
      {content}
    </Link>
  );
}

function PaymentMethodButton({
  orderId,
  method,
  active,
  title,
  description,
  icon,
  disabled = false,
}: {
  orderId: string;
  method: PaymentMethod;
  active: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <form action={selectSubscriptionPaymentMethod} className="h-full">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paymentMethod" value={method} />
      <button
        type="submit"
        disabled={disabled}
        className={`flex min-h-[72px] w-full items-center rounded-2xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
          active
            ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500 dark:bg-blue-950/30 dark:text-blue-300"
            : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        }`}
      >
        <span className="flex w-full items-center gap-3">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>
            {active ? <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold">{title}</span>
            <span className="mt-0.5 block text-xs font-medium opacity-75">{description}</span>
          </span>
        </span>
      </button>
    </form>
  );
}

function ManualPaymentRow({
  label,
  value,
  copyValue,
  helperText,
  highlight = false,
}: {
  label: string;
  value: string;
  copyValue?: string;
  helperText?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0 dark:border-slate-800">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p
          className={`mt-1 break-all font-bold ${
            highlight
              ? "text-lg tracking-wide text-blue-600"
              : "text-sm text-slate-900 dark:text-white"
          }`}
        >
          {value}
        </p>
        {helperText ? (
          <p className="mt-1.5 max-w-md text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
            {helperText}
          </p>
        ) : null}
      </div>
      {copyValue ? <CopyPaymentValue value={copyValue} /> : null}
    </div>
  );
}

function CheckoutStep({
  number,
  label,
  state,
}: {
  number: string;
  label: string;
  state: "complete" | "active" | "upcoming";
}) {
  const active = state === "active";
  const complete = state === "complete";
  return (
    <span className={`inline-flex items-center gap-2 ${active ? "text-blue-700 dark:text-blue-300" : complete ? "text-slate-700 dark:text-slate-200" : "text-slate-400"}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${active ? "bg-blue-600 text-white" : complete ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
        {complete ? <CheckCircle2 size={14} /> : number}
      </span>
      <span>{label}</span>
    </span>
  );
}

function PlanSnapshot({
  eyebrow,
  plan,
  detail,
  icon,
  accent = false,
}: {
  eyebrow: string;
  plan: string;
  detail: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent ? "bg-blue-600 text-white" : "bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{eyebrow}</p>
        <p className="mt-0.5 truncate text-sm font-black text-slate-950 dark:text-white">{plan}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function CheckoutInfo({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-700 dark:bg-slate-950">
      <span className="mt-0.5 text-blue-600 dark:text-blue-300">{icon}</span>
      <div>
        <p className="text-xs font-extrabold text-slate-900 dark:text-white">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

function CheckoutItemRow({
  icon,
  item,
  detail,
  price,
}: {
  icon: React.ReactNode;
  item: string;
  detail: React.ReactNode;
  price: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-4 last:border-b-0 dark:border-slate-800 sm:grid-cols-[minmax(0,.95fr)_minmax(0,1.5fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">{icon}</span>
        <div className="min-w-0">
          <p className="font-extrabold text-slate-950 dark:text-white">{item}</p>
          <div className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400 sm:hidden">{detail}</div>
        </div>
      </div>
      <div className="hidden min-w-0 text-sm leading-5 text-slate-500 dark:text-slate-400 sm:block">{detail}</div>
      <p className="text-right font-black text-slate-950 dark:text-white">{price}</p>
    </div>
  );
}

function CheckoutTotalRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 py-3 text-sm last:border-b-0 dark:border-slate-800">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-extrabold text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}
