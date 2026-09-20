"use client";

import {
  CheckCircle2,
  Package,
  Clock3,
  Truck,
  PhoneCall,
  PackageCheck,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { FaFacebook, FaTelegram, FaTiktok, FaInstagram, FaWhatsapp, FaFacebookMessenger, FaXTwitter, FaYoutube } from "react-icons/fa6";
import { rememberOrder } from "@/lib/storefront/order-tracking";
import { formatOrderDate, proofPath } from "@/lib/storefront/checkout-validation";
import { useCallback, useEffect, useState } from "react";

type PublicOrder = {
  order_number: string;
  online_status: string | null;
  fulfillment_type: string | null;
  discount: number;
  coupon_code: string | null;
  loyalty_points_earned: number;
  total: number;
  created_at: string;
  table_name: string | null;
  delivery_zone_name: string | null;
  requested_for: string | null;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  currency: string;
};

export default function OrderStatusClient({
  token,
  initialOrder, storeSlug, storeUrl, helpLinks, phone, emailStatus,
}: {
  token: string;
  emailStatus?: string;
  initialOrder: PublicOrder;
  storeSlug: string; storeUrl: string; helpLinks: { name: string; href: string }[]; phone: string | null;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  useEffect(() => { if (storeSlug) rememberOrder(storeSlug, token, initialOrder.order_number); }, [storeSlug, token, initialOrder.order_number]);
  async function copyTracking() {
    try { await navigator.clipboard.writeText(initialOrder.order_number); setCopyMessage("Tracking ID copied. Send it to the store for faster confirmation."); } catch { setCopyMessage(`Copy this tracking ID: ${initialOrder.order_number}`); }
  }
  const [order, setOrder] = useState(initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const response = await fetch(
        `/api/storefront/orders/${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (response.ok && payload?.order) {
        setOrder(payload.order as PublicOrder);
        setRefreshError(null);
      } else {
        setRefreshError("Unable to refresh the order. Please try again.");
      }
    } catch {
      setRefreshError("Connection lost. Your last order status is shown below.");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const status = order.online_status ?? "new";
  const appearance = getStatusAppearance(status, order.fulfillment_type);
  const Icon = appearance.icon;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-xl">
        {refreshError && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{refreshError}</p>}
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${appearance.iconClass}`}>
            <Icon size={30} />
          </div>

          <p className="mt-6 text-center text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
            Tenh POS Order
          </p>
          <h1 className="mt-2 text-center text-3xl font-bold text-slate-950">
            {order.order_number}
          </h1>

          <div className={`mx-auto mt-5 w-fit rounded-full px-4 py-2 text-sm font-semibold ${appearance.badgeClass}`}>
            {appearance.label}
          </div>

          <p className="mx-auto mt-4 max-w-md text-center text-sm leading-6 text-slate-500">
            {appearance.description}
          </p>

          <OrderProgress status={status} fulfillment={order.fulfillment_type} />

          <dl className="mt-8 divide-y divide-slate-100 rounded-2xl border border-slate-200 px-5">
            <Row label="Fulfillment" value={formatFulfillment(order.fulfillment_type)} />
            {order.table_name && <Row label="Table" value={order.table_name} />}
            {order.delivery_zone_name && (
              <Row label="Delivery zone" value={order.delivery_zone_name} />
            )}
            {order.requested_for && (
              <Row
                label="Requested for"
                value={formatOrderDate(order.requested_for)}
              />
            )}
            <Row
              label="Payment"
              value={formatPayment(order.payment_method, order.payment_status)}
            />
            {order.payment_reference && (
              <Row label={proofPath(order.payment_reference) ? "Payment proof" : "Payment reference"} value={proofPath(order.payment_reference) ? "Received - awaiting verification" : order.payment_reference} />
            )}
            {order.coupon_code && Number(order.discount) > 0 && (
              <Row
                label={`Coupon · ${order.coupon_code}`}
                value={`-${formatMoney(Number(order.discount), order.currency)}`}
              />
            )}
            <Row label="Total" value={formatMoney(order.total, order.currency)} />
            {Number(order.loyalty_points_earned) > 0 && (
              <Row
                label="Loyalty earned"
                value={`+${Number(order.loyalty_points_earned).toLocaleString("en-US")} points`}
              />
            )}
            <Row label="Placed" value={formatOrderDate(order.created_at)} />
          </dl>

          {emailStatus && <p role="status" className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{emailStatus === "sent" ? "Your confirmation email has been sent. Check your inbox or spam folder." : "Your order succeeded, but we could not send the confirmation email. Please save your tracking ID below."}</p>}
          <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <h2 className="font-bold text-slate-900">Track your order anytime</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">You can leave this page. Return to Track My Order and enter your tracking ID, shown above, on any device.</p>
            <button type="button" onClick={copyTracking} className="mt-3 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">Copy tracking ID</button>
            {copyMessage && <p role="status" className="mt-2 break-all text-sm">{copyMessage}</p>}
            {(helpLinks.length > 0 || phone) && <><h3 className="mt-5 font-semibold">Want faster confirmation? Contact us below.</h3><p className="mt-1 text-sm leading-6 text-slate-600">Copy your tracking ID and send it to the store so they can find your order quickly.</p><div className="mt-3 flex flex-wrap gap-2">{helpLinks.map(link => <a key={link.name} href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><ContactLogo name={link.name} />{link.name}</a>)}{phone && <a className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" href={`tel:${phone.replace(/[^+\d]/g, "")}`}><PhoneCall size={20} />{phone}</a>}</div></>}
            <a className="mt-4 block text-sm font-semibold text-blue-700" href={storeUrl}>Continue shopping →</a>
          </section>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Checking..." : "Refresh status"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "KHR" ? 0 : 2,
      maximumFractionDigits: currency === "KHR" ? 0 : 2,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function formatFulfillment(value: string | null) {
  if (value === "dine_in") return "Dine In";
  if (value === "delivery") return "Delivery";
  return "Pickup Store";
}

function formatPayment(method: string, status: string) {
  if (method === "khqr") {
    return status === "paid" ? "KHQR · Paid" : "KHQR · Pending verification";
  }
  return "Cash on Delivery (COD)";
}

function getStatusAppearance(status: string, fulfillment: string | null) {
  switch (status) {
    case "accepted":
      return {
        icon: CheckCircle2,
        label: "Accepted",
        description: "Staff confirmed your order and the store accepted it. Packing is next.",
        iconClass: "bg-blue-50 text-blue-600",
        badgeClass: "bg-blue-50 text-blue-700",
      };
    case "preparing":
      return {
        icon: Package,
        label: "Packing",
        description: "The store is packing your items. We will update this page when your order is ready.",
        iconClass: "bg-amber-50 text-amber-600",
        badgeClass: "bg-amber-50 text-amber-700",
      };
    case "ready":
      return {
        icon: fulfillment === "delivery" ? Truck : PackageCheck,
        label: fulfillment === "delivery" ? "Delivery" : "Ready for pickup",
        description: fulfillment === "delivery" ? "Your order is packed and ready for delivery. Contact the store for dispatch details." : fulfillment === "dine_in" ? "Your order is ready to be served." : "Your order is packed and ready to collect at the store.",
        iconClass: "bg-violet-50 text-violet-600",
        badgeClass: "bg-violet-50 text-violet-700",
      };
    case "completed":
      return {
        icon: CheckCircle2,
        label: "Completed",
        description: "This order has been completed. Thank you.",
        iconClass: "bg-emerald-50 text-emerald-600",
        badgeClass: "bg-emerald-50 text-emerald-700",
      };
    case "cancelled":
      return { icon: XCircle, label: "Cancelled", description: "This order was cancelled. Contact the store if you need help.", iconClass: "bg-red-50 text-red-600", badgeClass: "bg-red-50 text-red-700" };
    case "rejected":
      return {
        icon: XCircle,
        label: "Not accepted",
        description: "The shop could not accept this order. Please contact the shop if you need help.",
        iconClass: "bg-red-50 text-red-600",
        badgeClass: "bg-red-50 text-red-700",
      };
    default:
      return {
        icon: Clock3,
        label: "Awaiting confirmation",
        description: "Your order has been received. Please wait for the store to call and confirm your order. You do not need to keep this page open.",
        iconClass: "bg-emerald-50 text-emerald-600",
        badgeClass: "bg-emerald-50 text-emerald-700",
      };
  }
}

function ContactLogo({ name }: { name: string }) {
  const icons = { telegram: FaTelegram, facebook: FaFacebook, tiktok: FaTiktok, instagram: FaInstagram, whatsapp: FaWhatsapp, messenger: FaFacebookMessenger, x: FaXTwitter, youtube: FaYoutube };
  const Icon = icons[name.toLowerCase() as keyof typeof icons];
  return Icon ? <Icon size={22} aria-hidden="true" /> : null;
}

function OrderProgress({ status, fulfillment }: { status: string; fulfillment: string | null }) {
  if (status === "cancelled" || status === "rejected") return null;
  const steps = ["Awaiting confirmation", "Staff confirms", "Accepted", "Packing", fulfillment === "delivery" ? "Delivery" : fulfillment === "dine_in" ? "Ready to serve" : "Pickup Store"];
  // Staff confirmation is the action that moves an order from new to accepted.
  const active = status === "completed" ? 5 : status === "ready" ? 4 : status === "preparing" ? 3 : status === "accepted" ? 2 : 0;
  return <ol aria-label="Order progress" className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-5 sm:gap-2" aria-live="polite">
    {steps.map((label, index) => {
      const done = index < active; const current = index === active;
      return <li key={label} aria-current={current ? "step" : undefined} className={`flex items-center gap-3 sm:flex-col sm:text-center ${current ? "font-semibold text-blue-700" : done ? "text-emerald-700" : "text-slate-500"}`}>
        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs ${current ? "border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100" : done ? "border-emerald-200 bg-emerald-100" : "border-slate-200 bg-white"}`}>{done ? <CheckCircle2 size={18} /> : index + 1}</span>
        <span className="text-xs leading-5">{label}<span className="sr-only">{done ? ", completed" : current ? ", current step" : ", upcoming"}</span></span>
      </li>;
    })}
  </ol>;
}
