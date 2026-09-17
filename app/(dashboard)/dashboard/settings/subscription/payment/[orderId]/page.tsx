import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileCheck2,
  QrCode,
  UsersRound,
  XCircle,
} from "lucide-react";

import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSubscriptionPlanLabel } from "@/lib/subscriptions/plans";
import { submitSubscriptionPayment } from "../../actions";

type SubscriptionOrder = {
  id: string;
  order_kind: string;
  plan_key: string;
  requested_user_limit: number;
  term_months: number;
  monthly_price: number | string | null;
  discount_percent: number | string;
  subtotal_amount: number | string | null;
  term_price_amount: number | string | null;
  remaining_credit_amount: number | string | null;
  total_amount: number | string | null;
  currency: string;
  status: string;
  payment_note: string | null;
  proof_file_name: string | null;
  review_note: string | null;
  pricing_locked_until: string | null;
  created_at: string;
};

function money(value: number | string | null) {
  if (value === null) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function orderKindLabel(kind: string) {
  switch (kind) {
    case "reactivation": return "Reactivation";
    case "upgrade": return "Upgrade";
    case "renewal": return "Renewal";
    default: return "Activation";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "quote_requested": return "Quote requested";
    case "pending_payment": return "Payment required";
    case "payment_submitted": return "Payment under review";
    case "approved": return "Subscription activated";
    case "rejected": return "Payment rejected";
    default: return status.replace(/_/g, " ");
  }
}

export default async function SubscriptionPaymentPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const business = await getCurrentBusinessForSubscription();
  const { orderId } = await params;

  const { data, error } = await supabaseAdmin
    .from("subscription_orders")
    .select(
      "id,order_kind,plan_key,requested_user_limit,term_months,monthly_price,discount_percent,subtotal_amount,term_price_amount,remaining_credit_amount,total_amount,currency,status,payment_note,proof_file_name,review_note,pricing_locked_until,created_at",
    )
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error || !data) notFound();
  const order = data as SubscriptionOrder;

  const abaQrImageUrl = process.env.TENH_POS_ABA_QR_IMAGE_URL?.trim() || "";
  const abaAccountName = process.env.TENH_POS_ABA_ACCOUNT_NAME?.trim() || "TENH POS";
  const abaAccountNumber = process.env.TENH_POS_ABA_ACCOUNT_NUMBER?.trim() || "";
  const paymentInstructions = process.env.TENH_POS_SUBSCRIPTION_PAYMENT_INSTRUCTIONS?.trim() ||
    "Pay the exact USD amount using ABA QR, then upload the payment proof and add a short note. TENH verifies the payment manually before activating the subscription.";

  const pending = order.status === "pending_payment";
  const submitted = order.status === "payment_submitted";
  const approved = order.status === "approved";
  const rejected = order.status === "rejected";
  const quoteRequested = order.status === "quote_requested";
  const priceExpired =
    pending &&
    order.pricing_locked_until !== null &&
    new Date(order.pricing_locked_until).getTime() <= Date.now();
  const creditAmount = Number(order.remaining_credit_amount ?? 0);
  const hasCredit = Number.isFinite(creditAmount) && creditAmount > 0;

  return (
    <main className="mx-auto w-full max-w-6xl pb-10">
      <Link
        href="/dashboard/settings/subscription"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
      >
        <ArrowLeft size={16} />
        Back to Subscription
      </Link>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Subscription payment</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            {getSubscriptionPlanLabel(order.plan_key)}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {orderKindLabel(order.order_kind)} · Order #{order.id.slice(0, 8).toUpperCase()} · {order.requested_user_limit} users · {order.term_months === 12 ? "1 year" : `${order.term_months} months`}
          </p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${approved ? "bg-emerald-50 text-emerald-700" : rejected ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
          {approved ? <CheckCircle2 size={14} /> : rejected ? <XCircle size={14} /> : <Clock3 size={14} />}
          {statusLabel(order.status)}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-extrabold text-slate-950 dark:text-white">Order summary</h2>
          <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            <Row label="Flow" value={orderKindLabel(order.order_kind)} />
            <Row label="Plan" value={getSubscriptionPlanLabel(order.plan_key)} />
            <Row label="Users" value={`${order.requested_user_limit}`} icon={<UsersRound size={17} />} />
            <Row label="Term" value={order.term_months === 12 ? "1 year" : `${order.term_months} months`} />
            <Row label="Monthly rate" value={money(order.monthly_price)} />
            <Row label="Subtotal" value={money(order.subtotal_amount)} />
            <Row label="Term discount" value={`${Number(order.discount_percent).toFixed(0)}%`} />
            <Row label="Discounted term value" value={money(order.term_price_amount ?? order.total_amount)} />
            {hasCredit ? (
              <Row label="Current subscription credit" value={`-${money(creditAmount)}`} />
            ) : null}
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-950 px-5 py-4 text-white">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">One-time payment</p>
              <p className="mt-1 text-sm text-slate-300">Exact amount · USD</p>
            </div>
            <p className="text-3xl font-black">{money(order.total_amount)}</p>
          </div>

          {rejected && order.review_note ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800">
              {order.review_note}
            </div>
          ) : null}
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><CreditCard size={22} /></div>
          <h2 className="mt-4 text-xl font-extrabold text-slate-950 dark:text-white">ABA QR · Manual payment</h2>

          {quoteRequested ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
              TENH is preparing the custom monthly quote. Return to this page after the quote is created to pay the exact amount.
            </div>
          ) : approved ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
              Payment verified. Your subscription is active and the new plan entitlements are applied.
            </div>
          ) : submitted ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Payment proof submitted. Our team will verify it before activating the subscription.
            </div>
          ) : rejected ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
              This payment was rejected. Create a new subscription order from the Subscription page after correcting the payment.
            </div>
          ) : pending && priceExpired ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              This price lock expired before payment was submitted. Return to Subscription and create a fresh order so TENH can recalculate the remaining-value credit safely.
              <Link
                href="/dashboard/settings/subscription/plans"
                className="mt-3 inline-flex font-bold text-blue-700 hover:text-blue-800"
              >
                Create fresh subscription order
              </Link>
            </div>
          ) : pending ? (
            <>
              <p className="mt-3 text-sm leading-6 text-slate-500">{paymentInstructions}</p>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-950">
                {abaQrImageUrl ? (
                  // Plain img keeps the QR deployable without Next Image remote-domain configuration.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={abaQrImageUrl} alt="TENH POS ABA payment QR" className="mx-auto h-56 w-56 rounded-xl bg-white object-contain p-2" />
                ) : (
                  <div className="mx-auto flex h-44 w-44 flex-col items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                    <QrCode size={52} />
                    <span className="mt-2 text-xs font-bold">Configure ABA QR image</span>
                  </div>
                )}
                <p className="mt-4 font-extrabold text-slate-950 dark:text-white">{abaAccountName}</p>
                {abaAccountNumber ? <p className="mt-1 text-sm font-semibold text-slate-500">{abaAccountNumber}</p> : null}
                <p className="mt-3 text-2xl font-black text-blue-600">{money(order.total_amount)} USD</p>
              </div>

              {order.pricing_locked_until ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:bg-slate-950">
                  Price and upgrade credit are locked until {new Intl.DateTimeFormat("en-US", {
                    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Phnom_Penh",
                  }).format(new Date(order.pricing_locked_until))}. Submit payment proof before this time.
                </div>
              ) : null}

              <form action={submitSubscriptionPayment} className="mt-5 space-y-4">
                <input type="hidden" name="orderId" value={order.id} />
                <div>
                  <label htmlFor="paymentNote" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Note *</label>
                  <textarea
                    id="paymentNote"
                    name="paymentNote"
                    required
                    minLength={2}
                    maxLength={1000}
                    rows={3}
                    defaultValue={order.payment_note ?? ""}
                    placeholder="Example: Paid from ABA account ending 1234"
                    className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="paymentProof" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Payment proof *</label>
                  <input
                    id="paymentProof"
                    name="paymentProof"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    required={!order.proof_file_name}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  <p className="mt-1 text-xs text-slate-400">JPG, PNG, WEBP, or PDF · max 10 MB</p>
                </div>
                <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700">
                  <FileCheck2 size={17} />
                  Submit payment for review
                </button>
              </form>
            </>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">{icon}{value}</span>
    </div>
  );
}
