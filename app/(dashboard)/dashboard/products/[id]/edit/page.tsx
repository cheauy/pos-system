import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  adjustStock,
  updateProduct,
} from "@/app/(dashboard)/dashboard/products/actions";
import ImageUpload from "@/components/image-upload";

type EditProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
 image_url: string | null;
  description: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_quantity: number;
  is_active: boolean;
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const [
    { data: productData, error: productError },
    { data: categoryData },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(`
        id,
        category_id,
        name,
        sku,
        image_url,
        description,
        cost_price,
        selling_price,
        stock_quantity,
        low_stock_quantity,
        is_active
      `)
      .eq("id", id)
      .single(),

    supabase
      .from("categories")
      .select("id, name")
      .order("name"),
  ]);

  if (productError || !productData) {
    notFound();
  }

  const product = productData as Product;
  const categories =
    (categoryData ?? []) as Category[];

  return (
    <main>
      <Link
        href="/dashboard/products"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
      >
        <ArrowLeft size={18} />
        Back to products
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Edit Product
        </h1>

        <p className="mt-1 text-slate-500">
          Update product details and stock
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            Product Information
          </h2>

          <form
            action={updateProduct}
            className="mt-6 space-y-5"
          >
            <input
              type="hidden"
              name="productId"
              value={product.id}
            />

             

            <FormField
              label="Product name"
              htmlFor="name"
            >
              <input
                id="name"
                name="name"
                required
                minLength={2}
                defaultValue={product.name}
                className={inputClass}
              />
            </FormField>

            <FormField
              label="Category"
              htmlFor="categoryId"
            >
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={product.category_id ?? ""}
                className={inputClass}
              >
                <option value="">
                  No category
                </option>

                {categories.map((category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
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
                  defaultValue={product.sku ?? ""}
                  className={inputClass}
                />
              </FormField>
              <ImageUpload currentImage={product.image_url} />

              
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Cost price"
                htmlFor="costPrice"
              >
                <input
                  id="costPrice"
                  name="costPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={product.cost_price}
                  className={inputClass}
                />
              </FormField>

              <FormField
                label="Selling price"
                htmlFor="sellingPrice"
              >
                <input
                  id="sellingPrice"
                  name="sellingPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={product.selling_price}
                  className={inputClass}
                />
              </FormField>
            </div>

            <FormField
              label="Low-stock alert"
              htmlFor="lowStockQuantity"
            >
              <input
                id="lowStockQuantity"
                name="lowStockQuantity"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={
                  product.low_stock_quantity ?? 5
                }
                className={inputClass}
              />
            </FormField>

            <FormField
              label="Description"
              htmlFor="description"
            >
              <textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={
                  product.description ?? ""
                }
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={product.is_active}
                className="h-4 w-4"
              />

              <span>
                <span className="block font-medium text-slate-800">
                  Active product
                </span>

                <span className="text-sm text-slate-500">
                  Active products appear on the POS page.
                </span>
              </span>
            </label>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Save Changes
            </button>
          </form>
        </section>

        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            Adjust Stock
          </h2>

          <div className="mt-5 rounded-xl bg-slate-50 p-5">
            <p className="text-sm text-slate-500">
              Current stock
            </p>

            <p className="mt-1 text-4xl font-bold text-slate-900">
              {product.stock_quantity}
            </p>
          </div>

          <form
            action={adjustStock}
            className="mt-6 space-y-5"
          >
            <input
              type="hidden"
              name="productId"
              value={product.id}
            />

            <FormField
              label="Adjustment type"
              htmlFor="adjustmentType"
            >
              <select
                id="adjustmentType"
                name="adjustmentType"
                className={inputClass}
              >
                <option value="increase">
                  Increase stock
                </option>

                <option value="decrease">
                  Decrease stock
                </option>
              </select>
            </FormField>

            <FormField
              label="Quantity"
              htmlFor="quantity"
            >
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                step="1"
                required
                defaultValue="1"
                className={inputClass}
              />
            </FormField>

            <FormField label="Note" htmlFor="note">
              <textarea
                id="note"
                name="note"
                rows={3}
                placeholder="Example: New supplier delivery"
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Update Stock
            </button>
          </form>
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