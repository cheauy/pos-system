import Link from "next/link";
import {
  Eye,
  PackagePlus,
  Plus,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

type Purchase = {
  id: string;
  purchase_number: string;
  supplier_name: string | null;
  reference_number: string | null;
  purchase_date: string;
  status: string;
  total: number;
  created_at: string;
};

export default async function PurchasesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchases")
    .select(`
      id,
      purchase_number,
      supplier_name,
      reference_number,
      purchase_date,
      status,
      total,
      created_at
    `)
    .order("purchase_date", {
      ascending: false,
    })
    .order("created_at", {
      ascending: false,
    });

  const purchases =
    (data ?? []) as Purchase[];

  const totalPurchased = purchases
    .filter(
      (purchase) =>
        purchase.status === "received",
    )
    .reduce(
      (sum, purchase) =>
        sum + Number(purchase.total),
      0,
    );

  return (
    <main>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Purchases
          </h1>

          <p className="mt-1 text-slate-500">
            Track stock received from suppliers
          </p>
        </div>

        <Link
          href="/dashboard/purchases/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
        >
          <Plus size={18} />
          New Purchase
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard
          title="Purchase Records"
          value={purchases.length.toString()}
        />

        <SummaryCard
          title="Total Purchased"
          value={formatCurrency(
            totalPurchased,
          )}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-red-600">
            {error.message}
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-12 text-center">
            <PackagePlus
              size={46}
              className="mx-auto text-slate-300"
            />

            <p className="mt-4 font-semibold text-slate-700">
              No purchases recorded
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Receive your first supplier purchase.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-4">
                    Purchase
                  </th>

                  <th className="px-6 py-4">
                    Date
                  </th>

                  <th className="px-6 py-4">
                    Supplier
                  </th>

                  <th className="px-6 py-4">
                    Reference
                  </th>

                  <th className="px-6 py-4">
                    Status
                  </th>

                  <th className="px-6 py-4 text-right">
                    Total
                  </th>

                  <th className="px-6 py-4 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {purchase.purchase_number}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDate(
                        purchase.purchase_date,
                      )}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-700">
                      {purchase.supplier_name ??
                        "No supplier"}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-600">
                      {purchase.reference_number ??
                        "—"}
                    </td>

                    <td className="px-6 py-4">
                     <span
  className={`rounded-full px-3 py-1 text-xs font-semibold ${
    purchase.status === "cancelled"
      ? "bg-red-50 text-red-700"
      : purchase.status === "draft"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700"
  }`}
>
  {formatStatus(purchase.status)}
</span>
                    </td>

                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      {formatCurrency(
                        Number(purchase.total),
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex justify-end">
                        <Link
                          href={`/dashboard/purchases/${purchase.id}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <Eye size={16} />
                          View
                        </Link>
                      </div>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}