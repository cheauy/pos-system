import Link from "next/link";
import {
  ArrowLeft,
  PackageOpen,
} from "lucide-react";
import { notFound } from "next/navigation";

import CancelPurchaseForm from "./cancel-purchase-form";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

type PurchaseDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type Purchase = {
  id: string;
  business_id: string;
  purchase_number: string;
  supplier_name: string | null;
  reference_number: string | null;
  purchase_date: string;
  status: string;
  subtotal: number;
  total: number;
  notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
};

type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
};

export default async function PurchaseDetailsPage({
  params,
}: PurchaseDetailsPageProps) {
  const { id } = await params;

  const business = await requirePermission(
    "purchases.view",
  );

  const supabase = await createClient();

  /*
   * Load the purchase and its items separately.
   * This avoids nested relationship or RLS issues.
   */
  const [
    {
      data: purchaseData,
      error: purchaseError,
    },
    {
      data: purchaseItemsData,
      error: purchaseItemsError,
    },
  ] = await Promise.all([
    supabase
      .from("purchases")
      .select(`
        id,
        business_id,
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
        created_at
      `)
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle(),

    supabase
      .from("purchase_items")
      .select(`
        id,
        purchase_id,
        product_name,
        quantity,
        unit_cost,
        subtotal
      `)
      .eq("purchase_id", id)
      .order("created_at", {
        ascending: true,
      }),
  ]);

  if (purchaseError) {
    throw new Error(
      `Unable to load purchase: ${purchaseError.message}`,
    );
  }

  if (!purchaseData) {
    notFound();
  }

  if (purchaseItemsError) {
    throw new Error(
      `Unable to load purchased products: ${purchaseItemsError.message}`,
    );
  }

  const purchase =
    purchaseData as Purchase;

  const items =
    (purchaseItemsData ?? []) as PurchaseItem[];

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

      {purchase.status === "cancelled" && (
        <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="font-semibold text-red-900">
            Purchase Cancelled
          </h2>

          {purchase.cancelled_at && (
            <p className="mt-2 text-sm text-red-700">
              Cancelled on{" "}
              {new Intl.DateTimeFormat(
                "en-GB",
                {
                  dateStyle: "medium",
                  timeStyle: "short",
                },
              ).format(
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

          <p className="mt-1 text-sm text-slate-500">
            {items.length}{" "}
            {items.length === 1
              ? "product"
              : "products"}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <PackageOpen
                size={26}
                className="text-slate-500"
              />
            </div>

            <h3 className="mt-4 font-semibold text-slate-900">
              No purchased products found
            </h3>

            <p className="mt-1 max-w-md text-sm text-slate-500">
              This purchase exists, but no product
              rows were found in the purchase_items
              table.
            </p>
          </div>
        ) : (
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
                      {Number(item.quantity)}
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
        )}
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
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
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