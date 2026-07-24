"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Package,
  Pencil,
  Power,
  PowerOff,
  Search,
} from "lucide-react";

import { toggleProductStatus } from "@/app/(dashboard)/dashboard/products/actions";

type ProductCategory = {
  name: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_quantity: number;
  is_active: boolean;
  created_at: string;
  categories:
    | ProductCategory
    | ProductCategory[]
    | null;
};

function getCategoryName(
  categories:
    | ProductCategory
    | ProductCategory[]
    | null,
) {
  if (!categories) {
    return "Uncategorized";
  }

  if (Array.isArray(categories)) {
    return categories[0]?.name ?? "Uncategorized";
  }

  return categories.name;
}

export default function ProductList({
  products,
}: {
  products: Product[];
}) {
  const [search, setSearch] = useState("");

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return products;
    }

    return products.filter((product) =>
      product.name.toLowerCase().includes(keyword),
    );
  }, [products, search]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Product List
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {filteredProducts.length} products
            </p>
          </div>

          <div className="relative w-full lg:w-80">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search product name..."
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="p-12 text-center">
          <Package
            size={42}
            className="mx-auto text-slate-300"
          />

          <p className="mt-4 font-medium text-slate-700">
            No products found
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Try another product name.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4 font-semibold">
                  Image
                </th>

                <th className="px-6 py-4 font-semibold">
                  Product
                </th>

                <th className="px-6 py-4 font-semibold">
                  Category
                </th>

                <th className="px-6 py-4 font-semibold">
                  Cost
                </th>

                <th className="px-6 py-4 font-semibold">
                  Price
                </th>

                <th className="px-6 py-4 font-semibold">
                  Stock
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
              {filteredProducts.map((product) => {
                const isLowStock =
                  product.stock_quantity <=
                  product.low_stock_quantity;

                return (
                  <tr key={product.id}>
                    <td className="px-6 py-4">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                          <Package size={22} />
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">
                        {product.name}
                      </p>

                      {product.sku && (
                        <p className="mt-1 text-xs text-slate-500">
                          SKU: {product.sku}
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-600">
                      {getCategoryName(product.categories)}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-700">
                      $
                      {Number(
                        product.cost_price,
                      ).toFixed(2)}
                    </td>

                    <td className="px-6 py-4 font-semibold text-slate-900">
                      $
                      {Number(
                        product.selling_price,
                      ).toFixed(2)}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={
                          isLowStock
                            ? "font-semibold text-amber-600"
                            : "text-slate-700"
                        }
                      >
                        {product.stock_quantity}
                      </span>

                      {isLowStock && (
                        <p className="mt-1 text-xs text-amber-600">
                          Low stock
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={
                          product.is_active
                            ? "rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700"
                            : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                        }
                      >
                        {product.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/dashboard/products/${product.id}/edit`}
                          aria-label={`Edit ${product.name}`}
                          className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50"
                        >
                          <Pencil size={19} />
                        </Link>

                        <form action={toggleProductStatus}>
                          <input
                            type="hidden"
                            name="productId"
                            value={product.id}
                          />

                          <button
                            type="submit"
                            aria-label={
                              product.is_active
                                ? `Disable ${product.name}`
                                : `Enable ${product.name}`
                            }
                            className={`rounded-lg p-2 transition ${
                              product.is_active
                                ? "text-red-600 hover:bg-red-50"
                                : "text-green-600 hover:bg-green-50"
                            }`}
                          >
                            {product.is_active ? (
                              <PowerOff size={19} />
                            ) : (
                              <Power size={19} />
                            )}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}