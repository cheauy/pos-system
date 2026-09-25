import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Link2,
  Store,
  XCircle,
} from "lucide-react";

import { requirePermission } from "@/lib/auth/require-permission";
import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantDashboardUrl } from "@/lib/tenancy/domain";

import BusinessChangePaymentForm from "./payment-form";
import CreditCheckout, {type CreditCheckoutOrder} from "./credit-checkout";
import { expireSubscriptionPaymentRequestSafely } from "@/lib/subscriptions/payment-expiry";

type ChangeOrder = CreditCheckoutOrder & {
  id: string;
  old_slug: string;
  requested_slug: string;
  old_business_type: string | null;
  requested_business_type: string;
  change_url: boolean;
  change_business_mode: boolean;
  included_url_change: boolean;
  included_business_mode_change: boolean;
  unit_price: number | string;
  total_amount: number | string;
  currency: string;
  status: string;
  payment_reference: string | null;
  payment_note: string | null;
  proof_path: string | null;
  proof_file_name: string | null;
  proof_mime_type: string | null;
  proof_size_bytes: number | string | null;
  proof_uploaded_at: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function money(value: number | string) {
  return `$${Number(value).toFixed(2)}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "payment_submitted":
      return "Payment submitted";
    case "paid":
      return "Payment verified";
    case "applied":
      return "Paid & applied";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    default:
      return "Payment required";
  }
}

export default async function BusinessChangePaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<{cancel?:string}>;
}) {
  const business = await requirePermission("business.view");

  if (business.role !== "owner") {
    redirect("/dashboard/settings/business");
  }

  const { orderId } = await params;
  const query=searchParams?await searchParams:{};
  let expiryCheckFailed=false;
  try{
    const result=await expireSubscriptionPaymentRequestSafely({businessId:business.id,orderId,kind:"business_change"});
    expiryCheckFailed=result.state==='verification_required';
  }catch{expiryCheckFailed=true;}
  const { data, error } = await supabaseAdmin
    .from("business_change_orders")
    .select(
      "id,credit_purchase,payment_provider,manual_bank_name,manual_account_name,manual_account_number,manual_qr_image_url,payment_expires_at,payment_expired_at,old_slug,requested_slug,old_business_type,requested_business_type,change_url,change_business_mode,included_url_change,included_business_mode_change,unit_price,total_amount,currency,status,payment_reference,payment_note,proof_path,proof_file_name,proof_mime_type,proof_size_bytes,proof_uploaded_at,review_note,reviewed_at,created_at",
    )
    .eq("id", orderId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const order = data as ChangeOrder;
  if(order.credit_purchase)return <CreditCheckout order={order} businessId={business.id} cancelFailed={query.cancel==='unavailable'} expiryCheckFailed={expiryCheckFailed}/>;
  const oldMode = getBusinessModePreset(order.old_business_type ?? "");
  const newMode = getBusinessModePreset(order.requested_business_type);
  const isPending = ["pending_payment", "payment_submitted"].includes(order.status);
  const isApplied = order.status === "applied";
  const isRejected = order.status === "cancelled" && Boolean(order.review_note);
  const isCancelled = order.status === "cancelled";
  const platformPaymentInstructions =
    process.env.TENH_POS_CHANGE_PAYMENT_INSTRUCTIONS?.trim() || "";

  return (
    <main className="mx-auto w-full max-w-5xl pb-10">
      <Link
        href="/dashboard/settings/business"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300"
      >
        <ArrowLeft size={16} />
        Edit changes
      </Link>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
            Payment
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            Review your change order
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Order #{order.id.slice(0, 8).toUpperCase()} · {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
            isApplied
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          }`}
        >
          {isApplied ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
          {statusLabel(order.status)}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-extrabold text-slate-950 dark:text-white">
            Order details
          </h2>

          <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {order.change_url && (
              <LineItem
                icon={Link2}
                title="Store URL change"
                detail={`${order.old_slug}.tenh-pos.com → ${order.requested_slug}.tenh-pos.com`}
                price={order.included_url_change ? "Included" : money(order.unit_price)}
              />
            )}
            {order.change_business_mode && (
              <LineItem
                icon={Store}
                title="Business mode switch"
                detail={`${oldMode?.label ?? order.old_business_type ?? "Current mode"} → ${newMode?.label ?? order.requested_business_type}`}
                price={order.included_business_mode_change ? "Included" : money(order.unit_price)}
              />
            )}
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-950 px-5 py-4 text-white dark:bg-black">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Total
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {order.change_url && order.change_business_mode ? "2 changes" : "1 change"} · USD
              </p>
            </div>
            <p className="text-3xl font-black">{money(order.total_amount)}</p>
          </div>

        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <CreditCard size={22} />
          </div>
          <h2 className="mt-4 text-xl font-extrabold text-slate-950 dark:text-white">
            Payment
          </h2>

          {isApplied ? (
            <>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Payment was verified and the requested business changes were applied.
              </p>
              <a
                href={getTenantDashboardUrl(
                  order.requested_slug,
                  "/dashboard/settings",
                )}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Open updated business
              </a>
            </>
          ) : isRejected ? (
            <>
              <div className="mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300">
                <XCircle size={22} />
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-slate-950 dark:text-white">
                Payment rejected
              </h3>
              <p className="mt-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold leading-6 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
                {order.review_note}
              </p>
              {order.reviewed_at ? (
                <p className="mt-2 text-xs text-slate-400">
                  Reviewed {new Date(order.reviewed_at).toLocaleString()}
                </p>
              ) : null}
              <Link
                href="/dashboard/settings/business"
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Create a new change request
              </Link>
            </>
          ) : isCancelled ? (
            <>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                This change order was cancelled and no business changes were applied.
              </p>
              <Link
                href="/dashboard/settings/business"
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Back to Business Settings
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {platformPaymentInstructions ||
                  "Payment verification may take 1–2 business days. Your requested changes will be applied only after the payment is verified."}
              </p>

              {isPending && (
                <BusinessChangePaymentForm
                  orderId={order.id}
                  paymentReference={order.payment_reference}
                  paymentNote={order.payment_note}
                  hasProof={Boolean(order.proof_path)}
                  proofFileName={order.proof_file_name}
                  submitted={order.status === "payment_submitted"}
                />
              )}

              {order.status === "payment_submitted" && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>
                    Payment proof and note submitted. Our team will verify the payment before applying the changes.
                  </span>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

function LineItem({
  icon: Icon,
  title,
  detail,
  price,
}: {
  icon: typeof Link2;
  title: string;
  detail: string;
  price: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
        <Icon size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-950 dark:text-white">{title}</p>
            <p className="mt-1 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
              {detail}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-400">× 1</p>
            <p className="mt-1 font-extrabold text-slate-950 dark:text-white">{price}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
