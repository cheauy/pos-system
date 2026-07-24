import Link from "next/link";
import {
  Package,
  Pencil,
  Power,
  PowerOff,
  
} from "lucide-react";
import ImageUpload from "@/components/image-upload";
import { createClient } from "@/lib/supabase/server";
import ProductList from "@/components/product-list";
import {
  createProduct,
  toggleProductStatus,
} from "./actions";


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
  image_url: string | null;
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


export default async function ProductsPage({
    searchParams,
}: {
  searchParams: Promise<{
    search?: string;
  }>;
}) {
  const { search = "" } = await searchParams;
  const supabase = await createClient();
  
const { data: categoryData, error: categoryError } =
  await supabase
    .from("categories")
    .select("id, name")
    .order("name");

const productQuery = supabase
  .from("products")
  .select(`
    id,
    name,
    sku,
    image_url,
    cost_price,
    selling_price,
    stock_quantity,
    low_stock_quantity,
    is_active,
    created_at,
    categories(name)
  `);

if (search) {
  productQuery.ilike("name", `%${search}%`);
}

const {
  data: productData,
  error: productError,
} = await productQuery.order("created_at", {
  ascending: false,
});

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

                          <form
  action={createProduct}
  className="mt-6 space-y-5"
>
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
 <ImageUpload />
  

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
                <p className="mt-1 text-xs text-slate-500">
                   Show a warning when stock reaches this
                   quantity.
                </p>
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

           {productError ? (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 text-red-600 shadow-sm">
    {productError.message}
  </section>
) : (
  <ProductList products={products} />
)}
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