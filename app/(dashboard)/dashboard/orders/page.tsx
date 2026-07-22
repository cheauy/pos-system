import Link from "next/link";
import {
  Eye,
  ReceiptText,
  Search,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

type Order = {
  id: string;
  order_number: string;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  status: string;
  created_at: string;
};

type OrdersPageProps = {
  searchParams: Promise<{
    search?: string;
    status?: string;
  }>;
};

export default async function OrdersPage({
  searchParams,
}: OrdersPageProps) {
  const params = await searchParams;

  const search = params.search?.trim() ?? "";
  const status = params.status?.trim() ?? "all";

  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      total,
      payment_method,
      amount_paid,
      change_amount,
      status,
      created_at
    `)
    .order("created_at", {
      ascending: false,
    });

  if (search) {
    query = query.ilike(
      "order_number",
      `%${search}%`,
    );
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  const orders = (data ?? []) as Order[];

  const totalSales = orders
    .filter((order) => order.status === "completed")
    .reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Orders
        </h1>

        <p className="mt-1 text-slate-500">
          Review completed sales and print receipts
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard
          title="Orders shown"
          value={orders.length}
        />

        <SummaryCard
          title="Completed sales"
          value={`$${totalSales.toFixed(2)}`}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <form className="grid gap-4 md:grid-cols-[1fr_220px_auto]">
            <div className="relative">
              <Search
                size={19}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                name="search"
                type="search"
                defaultValue={search}
                placeholder="Search order number"
                className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <select
              name="status"
              defaultValue={status}
              className="rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Search
            </button>
          </form>
        </div>

        {error ? (
          <div className="p-6 text-red-600">
            {error.message}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <ReceiptText
              size={44}
              className="mx-auto text-slate-300"
            />

            <p className="mt-4 font-medium text-slate-700">
              No orders found
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Complete a sale from the POS screen first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-4 font-semibold">
                    Order
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Date
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Payment
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Total
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Status
                  </th>

                  <th className="px-6 py-4 text-right font-semibold">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">
                        {order.order_number}
                      </p>
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDate(order.created_at)}
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm font-medium capitalize text-slate-700">
                        {formatPaymentMethod(
                          order.payment_method,
                        )}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Paid: $
                        {Number(
                          order.amount_paid,
                        ).toFixed(2)}
                      </p>
                    </td>

                    <td className="px-6 py-4 font-bold text-slate-900">
                      ${Number(order.total).toFixed(2)}
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge status={order.status} />
                    </td>

                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100"
                      >
                        <Eye size={17} />
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
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
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const classes: Record<string, string> = {
    completed:
      "bg-green-50 text-green-700",
    pending:
      "bg-amber-50 text-amber-700",
    cancelled:
      "bg-red-50 text-red-700",
    refunded:
      "bg-purple-50 text-purple-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
        classes[status] ??
        "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPaymentMethod(value: string) {
  return value.replaceAll("_", " ");
}