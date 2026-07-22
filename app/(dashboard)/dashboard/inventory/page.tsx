import {
  ArrowDown,
  ArrowUp,
  History,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

type ProductRelation = {
  name: string;
  sku: string | null;
};

type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  note: string | null;
  created_at: string;
  products:
    | ProductRelation
    | ProductRelation[]
    | null;
};

export default async function InventoryPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_movements")
    .select(`
      id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      note,
      created_at,
      products (
        name,
        sku
      )
    `)
    .order("created_at", {
      ascending: false,
    })
    .limit(200);

  const movements = (data ?? []) as Movement[];

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Inventory History
        </h1>

        <p className="mt-1 text-slate-500">
          Review product stock changes
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-900">
            Recent Movements
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Showing the latest {movements.length} movements
          </p>
        </div>

        {error ? (
          <div className="p-6 text-red-600">
            {error.message}
          </div>
        ) : movements.length === 0 ? (
          <div className="p-12 text-center">
            <History
              size={44}
              className="mx-auto text-slate-300"
            />

            <p className="mt-4 text-slate-500">
              No inventory movements yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-4">
                    Product
                  </th>

                  <th className="px-6 py-4">
                    Type
                  </th>

                  <th className="px-6 py-4">
                    Quantity
                  </th>

                  <th className="px-6 py-4">
                    Stock
                  </th>

                  <th className="px-6 py-4">
                    Note
                  </th>

                  <th className="px-6 py-4">
                    Date
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {movements.map((movement) => {
                  const product =
                    getProduct(movement.products);

                  const isIncrease =
                    movement.quantity > 0;

                  return (
                    <tr key={movement.id}>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">
                          {product?.name ??
                            "Deleted product"}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          SKU: {product?.sku || "—"}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-sm capitalize text-slate-600">
                        {movement.movement_type.replaceAll(
                          "_",
                          " ",
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isIncrease
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {isIncrease ? (
                            <ArrowUp size={16} />
                          ) : (
                            <ArrowDown size={16} />
                          )}

                          {isIncrease ? "+" : ""}
                          {movement.quantity}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {movement.stock_before}
                        {" → "}
                        {movement.stock_after}
                      </td>

                      <td className="max-w-xs px-6 py-4 text-sm text-slate-500">
                        {movement.note || "—"}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatDate(
                          movement.created_at,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function getProduct(
  value:
    | ProductRelation
    | ProductRelation[]
    | null,
) {
  if (!value) {
    return null;
  }

  return Array.isArray(value)
    ? value[0] ?? null
    : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}