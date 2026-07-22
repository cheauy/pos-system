import Link from "next/link";
import {
  Package,
  Pencil,
  Trash2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createProduct, deleteProduct } from "./actions";


type Category = {
  id: string;
  name: string;
};

type ProductCategory = {
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_quantity: number;
  is_active: boolean;
  created_at: string;
  categories: ProductCategory | ProductCategory[] | null;
};

function getCategoryName(
  categories: ProductCategory | ProductCategory[] | null,
) {
  if (!categories) {
    return "Uncategorized";
  }

  if (Array.isArray(categories)) {
    return categories[0]?.name ?? "Uncategorized";
  }

  return categories.name;
}

export default async function ProductsPage() {
  const supabase = await createClient();

  const [
    { data: categoryData, error: categoryError },
    { data: productData, error: productError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true }),

    supabase
      .from("products")
      .select(`
        id,
        name,
        sku,
        barcode,
        cost_price,
        selling_price,
        stock_quantity,
        low_stock_quantity,
        is_active,
        created_at,
        categories (
          name
        )
      `)
      .order("created_at", { ascending: false }),
  ]);

  const categories = (categoryData ?? []) as Category[];
  const products = (productData ?? []) as Product[];

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Products
        </h1>

        <p className="mt-1 text-slate-500">
          Manage products, prices and inventory
        </p>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[430px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Package size={22} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Add Product
              </h2>

              <p className="text-sm text-slate-500">
                Enter the product information
              </p>
            </div>
          </div>

          {categoryError && (
            <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {categoryError.message}
            </p>
          )}

          <form action={createProduct} className="mt-6 space-y-5">
            <FormField label="Product name" htmlFor="name">
              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                placeholder="Example: Coca-Cola 330ml"
                className={inputClass}
              />
            </FormField>

            <FormField label="Category" htmlFor="categoryId">
              <select
                id="categoryId"
                name="categoryId"
                className={inputClass}
                defaultValue=""
              >
                <option value="">No category</option>

                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="SKU" htmlFor="sku">
                <input
                  id="sku"
                  name="sku"
                  type="text"
                  placeholder="DRINK-001"
                  className={inputClass}
                />
              </FormField>

              <FormField label="Barcode" htmlFor="barcode">
                <input
                  id="barcode"
                  name="barcode"
                  type="text"
                  inputMode="numeric"
                  placeholder="885000000001"
                  className={inputClass}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Cost price" htmlFor="costPrice">
                <input
                  id="costPrice"
                  name="costPrice"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className={inputClass}
                />
              </FormField>

              <FormField label="Selling price" htmlFor="sellingPrice">
                <input
                  id="sellingPrice"
                  name="sellingPrice"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className={inputClass}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Stock quantity" htmlFor="stockQuantity">
                <input
                  id="stockQuantity"
                  name="stockQuantity"
                  type="number"
                  required
                  min="0"
                  step="1"
                  defaultValue="0"
                  className={inputClass}
                />
              </FormField>

              <FormField
                label="Low-stock alert"
                htmlFor="lowStockQuantity"
              >
                <input
                  id="lowStockQuantity"
                  name="lowStockQuantity"
                  type="number"
                  required
                  min="0"
                  step="1"
                  defaultValue="5"
                  className={inputClass}
                />
              </FormField>
            </div>

            <FormField label="Description" htmlFor="description">
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Optional product description"
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Add Product
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Product List
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {products.length} products
            </p>
          </div>

          {productError ? (
            <div className="p-6 text-red-600">
              {productError.message}
            </div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center">
              <Package
                size={42}
                className="mx-auto text-slate-300"
              />

              <p className="mt-4 font-medium text-slate-700">
                No products yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Add your first product using the form.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
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
                  {products.map((product) => {
                    const isLowStock =
                      product.stock_quantity <=
                      product.low_stock_quantity;

                    return (
                      <tr key={product.id}>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-900">
                            {product.name}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            SKU: {product.sku || "—"} · Barcode:{" "}
                            {product.barcode || "—"}
                          </p>
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {getCategoryName(product.categories)}
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-700">
                          ${Number(product.cost_price).toFixed(2)}
                        </td>

                        <td className="px-6 py-4 font-semibold text-slate-900">
                          ${Number(product.selling_price).toFixed(2)}
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
                            
  <form action={deleteProduct}>
    <input
      type="hidden"
      name="productId"
      value={product.id}
    />

    <button
      type="submit"
      aria-label={`Delete ${product.name}`}
      className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
    >
      <Trash2 size={19} />
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
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      {children}
    </div>
  );
}