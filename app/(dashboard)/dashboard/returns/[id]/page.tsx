import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReturnDetailsPage({
  params,
}: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: returnRecord, error } =
    await supabase
      .from("returns")
      .select(`
        id,
        return_number,
        order_id,
        reason,
        refund_amount,
        created_at,
        orders (
          order_number
        ),
        return_items (
          id,
          product_name,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .eq("id", id)
      .single();

  if (error || !returnRecord) {
    notFound();
  }

  await createAuditLog({
      action: "return",
      entityType: "order",
      entityId: returnRecord.id,
      description: `Returned products for order`,
     
    });
  const order = Array.isArray(
    returnRecord.orders,
  )
    ? returnRecord.orders[0]
    : returnRecord.orders;

  return (


    <main>
      <Link
        href="/dashboard/returns"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={17} />
        Back to returns
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          {returnRecord.return_number}
        </h1>

        <p className="mt-1 text-slate-500">
          Created{" "}
          {formatDateTime(
            returnRecord.created_at,
          )}
        </p>
      </div>

            <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="font-semibold text-amber-900">
          Return Reason
        </h2>

        <p className="mt-2 text-sm text-amber-800">
          {returnRecord.reason}
        </p>
      </section>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <InfoCard
          label="Order"
          value={order?.order_number ?? "—"}
        />

       <InfoCard
         label="Customer"
           value="Walk-in customer"
        />

        <InfoCard
          label="Refund Amount"
          value={formatCurrency(
            Number(
              returnRecord.refund_amount,
            ),
          )}
        />
      </div>



      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-900">
            Returned Products
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
                  Unit Price
                </th>

                <th className="px-6 py-4 text-right">
                  Refund
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {returnRecord.return_items.map(
                (item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {item.product_name}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {item.quantity}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {formatCurrency(
                        Number(item.unit_price),
                      )}
                    </td>

                    <td className="px-6 py-4 text-right font-bold text-red-600">
                      -
                      {formatCurrency(
                        Number(item.subtotal),
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>

            <tfoot className="bg-slate-50">
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-5 text-right font-semibold"
                >
                  Total Refund
                </td>

                <td className="px-6 py-5 text-right text-xl font-bold text-red-600">
                  -
                  {formatCurrency(
                    Number(
                      returnRecord.refund_amount,
                    ),
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}