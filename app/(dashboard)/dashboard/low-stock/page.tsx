import Link from "next/link";

import {
  AlertTriangle,
  PackageX,
  Pencil,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

type Product = {
  id: string;
  name: string;
  stock_quantity: number;
  low_stock_quantity: number;
};


export default async function LowStockPage() {
  const supabase = await createClient();

 const { data, error } = await supabase
  .from("products")
  .select(
    "id, name, stock_quantity, low_stock_quantity",
  )
  .order("stock_quantity", {
    ascending: true,
  });

  if (error) {
  console.error(error);
}
const products: Product[] = data ?? [];


  const lowStockProducts = products.filter(
    (product) =>
      product.stock_quantity <=
      product.low_stock_quantity,
  );

  const outOfStockProducts =
    lowStockProducts.filter(
      (product) =>
        product.stock_quantity <= 0,
    );

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Low Stock
        </h1>

        <p className="mt-1 text-slate-500">
          Products that need to be purchased or
          restocked
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard
          title="Low-stock Products"
          value={lowStockProducts.length}
          icon={
            <AlertTriangle size={22} />
          }
        />

        <SummaryCard
          title="Out of Stock"
          value={outOfStockProducts.length}
          icon={<PackageX size={22} />}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-red-600">
            {error.message}
          </div>
        ) : lowStockProducts.length === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle
              size={46}
              className="mx-auto text-slate-300"
            />

            <p className="mt-4 font-semibold text-slate-700">
              Stock levels look good
            </p>

            <p className="mt-1 text-sm text-slate-500">
              No products currently require
              restocking.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-4">
                    Product
                  </th>

                  <th className="px-6 py-4 text-right">
                    Current Stock
                  </th>

                  <th className="px-6 py-4 text-right">
                    Alert Level
                  </th>

                  <th className="px-6 py-4">
                    Status
                  </th>

                  <th className="px-6 py-4 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {lowStockProducts.map(
                  (product) => {
                    const isOutOfStock =
                      product.stock_quantity <= 0;

                    return (
                      <tr key={product.id}>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {product.name}
                        </td>

                        <td className="px-6 py-4 text-right font-bold">
                          {product.stock_quantity}
                        </td>

                        <td className="px-6 py-4 text-right text-slate-600">
                          {
                            product.low_stock_quantity
                          }
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              isOutOfStock
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {isOutOfStock
                              ? "Out of Stock"
                              : "Low Stock"}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex justify-end">
                            <Link
                              href={`/dashboard/products/${product.id}/edit`}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <Pencil size={16} />
                              Edit Product
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

      {lowStockProducts.length > 0 && (
        <div className="mt-6 flex justify-end">
          <Link
            href="/dashboard/purchases/new"
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            Create Purchase
          </Link>
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {title}
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value}
          </p>
        </div>

        <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
          {icon}
        </div>
      </div>
    </div>
  );
}