import { Package, Settings2, SlidersHorizontal } from "lucide-react";

import ProductList from "@/components/product-list";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import ConfigurableProductForm from "./configurable-product-form";
import StandardProductForm from "./standard-product-form";
import VariantProductForm from "./variant-product-form";

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
  is_online: boolean;
  created_at: string;
  size: string | null;
  color: string | null;
  product_type: string | null;
  variant_group_id: string | null;
  categories: ProductCategory | ProductCategory[] | null;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const { search = "" } = await searchParams;
  const supabase = await createClient();
  const business = await requirePermission("products.view");

  const [{ data: categoryData, error: categoryError }, { data: storefrontData }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("business_id", business.id)
        .order("name"),
      supabase
        .from("business_storefronts")
        .select("business_type")
        .eq("business_id", business.id)
        .maybeSingle(),
    ]);

  const businessType = storefrontData?.business_type ?? "general";

  let productQuery = supabase
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
      is_online,
      created_at,
      size,
      color,
      product_type,
      variant_group_id,
      categories(name)
    `)
    .eq("business_id", business.id);

  if (search) {
    productQuery = productQuery.ilike("name", `%${search}%`);
  }

  const { data: productData, error: productError } =
    await productQuery.order("created_at", {
      ascending: false,
    });

  const categories = (categoryData ?? []) as Category[];
  const products = (productData ?? []) as Product[];

  const modeMeta =
    businessType === "shoes"
      ? {
          title: "Add Shoe",
          description: "Create one shoe model with size, colour, SKU and stock for every variation.",
          icon: <SlidersHorizontal size={22} />,
        }
      : business.product_mode === "variant"
      ? {
          title: "Add Variant Product",
          description: "Create size, colour, SKU, price and stock variants.",
          icon: <SlidersHorizontal size={22} />,
        }
      : businessType === "milk_tea"
        ? {
            title: "Add Drink",
            description: "Create milk tea with cup size, sugar, ice, milk and toppings.",
            icon: <Settings2 size={22} />,
          }
      : business.product_mode === "configurable"
        ? {
            title: "Add Configurable Product",
            description: "Create option groups such as size, sugar, ice and toppings.",
            icon: <Settings2 size={22} />,
          }
        : {
            title: "Add Product",
            description: "Enter the product information.",
            icon: <Package size={22} />,
          };

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Products</h1>
        <p className="mt-1 text-slate-500">
          Manage products, prices, inventory and online-store availability.
        </p>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[470px_minmax(0,1fr)]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              {modeMeta.icon}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {modeMeta.title}
              </h2>
              <p className="text-sm text-slate-500">
                {modeMeta.description}
              </p>
            </div>
          </div>

          <div className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">
            {businessType === "shoes" ? "Shoes mode" : businessType === "milk_tea" ? "Milk Tea mode" : `${business.product_mode.replaceAll("_", " ")} mode`}
          </div>

          {categoryError && (
            <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {categoryError.message}
            </p>
          )}

          {business.product_mode === "variant" ? (
            <VariantProductForm categories={categories} businessType={businessType} />
          ) : business.product_mode === "configurable" ? (
            <ConfigurableProductForm categories={categories} businessType={businessType} />
          ) : (
            <StandardProductForm categories={categories} />
          )}
        </section>

        <div className="min-w-0">
          {productError ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-red-600 shadow-sm">
              {productError.message}
            </section>
          ) : (
            <ProductList products={products} />
          )}
        </div>
      </div>
    </main>
  );
}
