import Link from "next/link";
import {
  ArrowLeft,
  Gift,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import { adjustCustomerLoyalty } from "../actions";

type CustomerOrder = {
  id: string;
  order_number: string;
  total: number;
  status: string;
  order_source: string;
  coupon_code: string | null;
  loyalty_points_earned: number;
  created_at: string;
};

type LoyaltyTransaction = {
  id: string;
  order_id: string | null;
  transaction_type: string;
  points: number;
  note: string | null;
  created_at: string;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  loyalty_points: number;
  lifetime_loyalty_points: number;
  orders: CustomerOrder[];
  customer_loyalty_transactions: LoyaltyTransaction[];
};

type CustomerPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CustomerDetailsPage({
  params,
}: CustomerPageProps) {
  const { id } = await params;
  const business = await requirePermission("customers.view");

  const [settings, customerResult] = await Promise.all([
    getStorefrontSettings(business.id),
    supabaseAdmin
      .from("customers")
      .select(`
        id,
        name,
        phone,
        email,
        address,
        note,
        loyalty_points,
        lifetime_loyalty_points,
        orders (
          id,
          order_number,
          total,
          status,
          order_source,
          coupon_code,
          loyalty_points_earned,
          created_at
        ),
        customer_loyalty_transactions (
          id,
          order_id,
          transaction_type,
          points,
          note,
          created_at
        )
      `)
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  if (customerResult.error || !customerResult.data) {
    notFound();
  }

  const customer = customerResult.data as unknown as Customer;

  const orders = [...(customer.orders ?? [])].sort(
    (first, second) =>
      new Date(second.created_at).getTime() -
      new Date(first.created_at).getTime(),
  );

  const loyaltyTransactions = [
    ...(customer.customer_loyalty_transactions ?? []),
  ].sort(
    (first, second) =>
      new Date(second.created_at).getTime() -
      new Date(first.created_at).getTime(),
  );

  const completedOrders = orders.filter(
    (order) => order.status === "completed",
  );

  const totalSpent = completedOrders.reduce(
    (sum, order) => sum + Number(order.total),
    0,
  );

  const canAdjust =
    business.role === "owner" ||
    business.role === "admin" ||
    business.role === "cashier";

  return (
    <main>
      <Link
        href="/dashboard/customers"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
      >
        <ArrowLeft size={18} />
        Back to customers
      </Link>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="h-fit space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              {customer.name}
            </h1>

            <div className="mt-6 space-y-5">
              <InformationRow label="Phone" value={customer.phone} />
              <InformationRow label="Email" value={customer.email} />
              <InformationRow label="Address" value={customer.address} />
              <InformationRow label="Note" value={customer.note} />
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white p-2.5 text-violet-600 shadow-sm">
                <Gift size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-violet-900">
                  Loyalty balance
                </p>
                <p className="text-3xl font-bold text-violet-950">
                  {Number(customer.loyalty_points ?? 0).toLocaleString()} pts
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-violet-700">
              Lifetime earned:{" "}
              {Number(customer.lifetime_loyalty_points ?? 0).toLocaleString()} points
            </p>

            {canAdjust && (
              <form
                action={adjustCustomerLoyalty}
                className="mt-5 space-y-3 rounded-xl bg-white p-4 shadow-sm"
              >
                <input type="hidden" name="customerId" value={customer.id} />
                <label className="block text-xs font-semibold text-slate-600">
                  Manual adjustment
                  <input
                    name="points"
                    type="number"
                    step="1"
                    required
                    placeholder="+50 or -20"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Note
                  <input
                    name="note"
                    maxLength={300}
                    placeholder="Reason for adjustment"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  Adjust Points
                </button>
              </form>
            )}
          </div>
        </section>

        <section>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <SummaryCard
              title="Completed orders"
              value={completedOrders.length}
            />
            <SummaryCard
              title="Total spent"
              value={formatMoney(totalSpent, settings.currency)}
            />
            <SummaryCard
              title="Points balance"
              value={Number(customer.loyalty_points ?? 0).toLocaleString()}
            />
            <SummaryCard
              title="Lifetime points"
              value={Number(
                customer.lifetime_loyalty_points ?? 0,
              ).toLocaleString()}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">
                Purchase History
              </h2>
            </div>

            {orders.length === 0 ? (
              <div className="p-12 text-center">
                <ReceiptText
                  size={42}
                  className="mx-auto text-slate-300"
                />
                <p className="mt-4 text-slate-500">
                  This customer has no orders yet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-5 transition hover:bg-slate-50"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">
                          {order.order_number}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-500">
                          {order.order_source}
                        </span>
                        {order.coupon_code && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            {order.coupon_code}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-slate-900">
                        {formatMoney(Number(order.total), settings.currency)}
                      </p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {order.status}
                        {Number(order.loyalty_points_earned) > 0
                          ? ` · +${order.loyalty_points_earned} pts`
                          : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-5">
              <Sparkles size={19} className="text-violet-600" />
              <h2 className="text-xl font-semibold text-slate-900">
                Loyalty Activity
              </h2>
            </div>

            {loyaltyTransactions.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                No loyalty activity yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {loyaltyTransactions.slice(0, 50).map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-start justify-between gap-4 px-6 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold capitalize text-slate-800">
                        {transaction.transaction_type.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {transaction.note || formatDate(transaction.created_at)}
                      </p>
                    </div>
                    <span
                      className={`font-bold ${
                        transaction.points > 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {transaction.points > 0 ? "+" : ""}
                      {transaction.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InformationRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
        {value || "—"}
      </p>
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "KHR" ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
