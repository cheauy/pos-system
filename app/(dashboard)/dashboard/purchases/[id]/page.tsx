import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import CancelPurchaseForm from "./cancel-purchase-form";

type PurchaseDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PurchaseItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
};

export default async function PurchaseDetailsPage({
  params,
}: PurchaseDetailsPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: purchase, error } =
    await supabase
      .from("purchases")
      .select(`
        id,
        purchase_number,
        supplier_name,
        reference_number,
        purchase_date,
        status,
        subtotal,
        total,
        notes,
        cancellation_reason,
        cancelled_at,
        created_at,
        purchase_items (
          id,
          product_name,
          quantity,
          unit_cost,
          subtotal
        )
      `)
      .eq("id", id)
      .single();

  if (
    error ||
    !purchase
  ) {
    notFound();
  }

  const items =
    (purchase.purchase_items ??
      []) as PurchaseItem[];

  return (
    <main>
      <Link
        href="/dashboard/purchases"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={17} />
        Back to purchases
      </Link>

      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
  <div>
    <h1 className="text-3xl font-bold text-slate-900">
      {purchase.purchase_number}
    </h1>

    <p className="mt-1 text-slate-500">
      Received on{" "}
      {formatDate(
        purchase.purchase_date,
      )}
    </p>
  </div>

  <div className="flex flex-col items-start gap-3 sm:items-end">
    <span
      className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${
        purchase.status === "cancelled"
          ? "bg-red-50 text-red-700"
          : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {formatStatus(purchase.status)}
    </span>

    {purchase.status === "cancelled" && (
  <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-6">
    <h2 className="font-semibold text-red-900">
      Purchase Cancelled
    </h2>

    {purchase.cancelled_at && (
      <p className="mt-2 text-sm text-red-700">
        Cancelled on{" "}
        {new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(
          new Date(
            purchase.cancelled_at,
          ),
        )}
      </p>
    )}

    <p className="mt-3 text-sm text-red-800">
      <span className="font-semibold">
        Reason:
      </span>{" "}
      {purchase.cancellation_reason ??
        "No reason recorded"}
    </p>
  </section>
)}

    {purchase.status === "received" && (
      <CancelPurchaseForm
        purchaseId={purchase.id}
        purchaseNumber={
          purchase.purchase_number
        }
      />
    )}
  </div>
</div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <InfoCard
          label="Supplier"
          value={
            purchase.supplier_name ??
            "No supplier"
          }
        />

        <InfoCard
          label="Reference"
          value={
            purchase.reference_number ??
            "—"
          }
        />

        <InfoCard
          label="Total"
          value={formatCurrency(
            Number(purchase.total),
          )}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-900">
            Purchased Products
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4">
                  Product
                </th>

                <th className="px-6 py-4 text-right">
                  Quantity
                </th>

                <th className="px-6 py-4 text-right">
                  Unit Cost
                </th>

                <th className="px-6 py-4 text-right">
                  Subtotal
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {item.product_name}
                  </td>

                  <td className="px-6 py-4 text-right">
                    {item.quantity}
                  </td>

                  <td className="px-6 py-4 text-right">
                    {formatCurrency(
                      Number(item.unit_cost),
                    )}
                  </td>

                  <td className="px-6 py-4 text-right font-bold">
                    {formatCurrency(
                      Number(item.subtotal),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot className="bg-slate-50">
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-5 text-right font-semibold text-slate-700"
                >
                  Total
                </td>

                <td className="px-6 py-5 text-right text-xl font-bold text-slate-900">
                  {formatCurrency(
                    Number(purchase.total),
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {purchase.notes && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            Notes
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            {purchase.notes}
          </p>
        </section>
      )}
    </main>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="mt-2 font-bold text-slate-900">
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