"use client";

import {
  CheckCircle2,
  ChefHat,
  Clock3,
  PackageCheck,
  RefreshCw,
  XCircle,
} from "lucide-react";
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
  initialOrder,
}: {
  token: string;
  initialOrder: PublicOrder;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [refreshing, setRefreshing] = useState(false);

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
      }
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const status = order.online_status ?? "new";
  const appearance = getStatusAppearance(status);
  const Icon = appearance.icon;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-xl">
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

          <dl className="mt-8 divide-y divide-slate-100 rounded-2xl border border-slate-200 px-5">
            <Row label="Fulfillment" value={formatFulfillment(order.fulfillment_type)} />
            {order.table_name && <Row label="Table" value={order.table_name} />}
            {order.delivery_zone_name && (
              <Row label="Delivery zone" value={order.delivery_zone_name} />
            )}
            {order.requested_for && (
              <Row
                label="Requested for"
                value={new Date(order.requested_for).toLocaleString()}
              />
            )}
            <Row
              label="Payment"
              value={formatPayment(order.payment_method, order.payment_status)}
            />
            {order.payment_reference && (
              <Row label="Payment reference" value={order.payment_reference} />
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
                value={`+${Number(order.loyalty_points_earned).toLocaleString()} points`}
              />
            )}
            <Row label="Placed" value={new Date(order.created_at).toLocaleString()} />
          </dl>

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
  return "Pickup";
}

function formatPayment(method: string, status: string) {
  if (method === "khqr") {
    return status === "paid" ? "KHQR · Paid" : "KHQR · Pending verification";
  }
  return "Pay Later / Cash";
}

function getStatusAppearance(status: string) {
  switch (status) {
    case "accepted":
      return {
        icon: CheckCircle2,
        label: "Accepted",
        description: "The shop accepted your order and will start preparing it soon.",
        iconClass: "bg-blue-50 text-blue-600",
        badgeClass: "bg-blue-50 text-blue-700",
      };
    case "preparing":
      return {
        icon: ChefHat,
        label: "Preparing",
        description: "Your order is being prepared now.",
        iconClass: "bg-amber-50 text-amber-600",
        badgeClass: "bg-amber-50 text-amber-700",
      };
    case "ready":
      return {
        icon: PackageCheck,
        label: "Ready",
        description: "Your order is ready for pickup, delivery, or service at your table.",
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
        label: "Waiting for confirmation",
        description: "Your order was sent to the shop. Keep this page open for live status updates.",
        iconClass: "bg-slate-100 text-slate-600",
        badgeClass: "bg-slate-100 text-slate-700",
      };
  }
}
