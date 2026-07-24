import Link from "next/link";

import {
  Eye,
  RotateCcw,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

type CustomerRelation =
  | {
      name: string;
    }
  | {
      name: string;
    }[]
  | null;

type OrderRelation =
  | {
      order_number: string;
      payment_method: string;
      customers: CustomerRelation;
    }
  | {
      order_number: string;
      payment_method: string;
      customers: CustomerRelation;
    }[]
  | null;

type ReturnRecord = {
  id: string;
  return_number: string;
  order_id: string;
  reason: string;
  refund_amount: number;
  created_at: string;
orders: OrderRelation;
};

export default async function ReturnsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("returns")
    .select(`
      id,
      return_number,
      order_id,
      reason,
      refund_amount,
      created_at,
      orders (
        order_number,
        payment_method,
        customers (
        name
      )
      )
    `)
    .order("created_at", {
      ascending: false,
    });

 const returns: ReturnRecord[] = data ?? [];

  const totalRefunded = returns.reduce(
    (sum, item) =>
      sum + Number(item.refund_amount),
    0,
  );

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Returns
        </h1>

        <p className="mt-1 text-slate-500">
          View customer returns and refund history
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard
          title="Return Records"
          value={returns.length.toString()}
        />

        <SummaryCard
          title="Total Refunded"
          value={formatCurrency(
            totalRefunded,
          )}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-red-600">
            {error.message}
          </div>
        ) : returns.length === 0 ? (
          <div className="p-12 text-center">
            <RotateCcw
              size={46}
              className="mx-auto text-slate-300"
            />

            <p className="mt-4 font-semibold text-slate-700">
              No returns recorded
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-4">
                    ORDER
                  </th>

                  <th className="px-6 py-4">
                    Customer
                  </th>

                  <th className="px-6 py-4">
                    Payment Status
                  </th>

                  <th className="px-6 py-4">
                    Reason
                  </th>

                  <th className="px-6 py-4 text-right">
                    Refund
                  </th>

                  <th className="px-6 py-4">
                    Date
                  </th>

                  <th className="px-6 py-4 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {returns.map(
                  (returnRecord) => {
                    const relatedOrder =
                      Array.isArray(
                        returnRecord.orders,
                      )
                        ? returnRecord.orders[0]
                        : returnRecord.orders;
                    const relatedCustomer = Array.isArray(
                           relatedOrder?.customers,
                            )
                              ? relatedOrder?.customers[0]
                              : relatedOrder?.customers;
               return (
                      <tr
                        key={returnRecord.id}
                      >
                        <td className="px-6 py-4">
                          {relatedOrder
                            ?.order_number ?? "—"}
                        </td>

                        <td className="px-6 py-4 text-slate-600">
                          {relatedCustomer?.name}
                        </td>

                        
                       <td className="px-6 py-4 text-slate-600">
                          {formatPaymentMethod(relatedOrder?.payment_method)}
                        </td>

                        <td className="max-w-xs truncate px-6 py-4 text-sm text-slate-600">
                          {returnRecord.reason}
                        </td>

                        <td className="px-6 py-4 text-right font-bold text-red-600">
                          -
                          {formatCurrency(
                            Number(
                              returnRecord.refund_amount,
                            ),
                          )}
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatDateTime(
                            returnRecord.created_at,
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex justify-end">
                            <Link
                              href={`/dashboard/returns/${returnRecord.id}`}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <Eye size={16} />
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  },
                )}
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
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPaymentMethod(method?: string) {
  if (!method) return "Unknown";

  switch (method.toLowerCase()) {
    case "cash":
      return "Cash";

    case "card":
      return "Card";

    case "khqr":
      return "KHQR";

    case "aba":
      return "ABA";

    case "bank":
      return "Bank Transfer";

    default:
      return method.charAt(0).toUpperCase() + method.slice(1);
  }
}