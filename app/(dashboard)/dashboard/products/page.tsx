import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Settings2,
  Shirt,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

import ProductList from "@/components/product-list";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentBusinessMode } from "@/lib/business/get-current-business-mode";
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
  barcode: string | null;
  image_url: string | null;
  variant_image_url: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_quantity: number;
  is_active: boolean;
  is_online: boolean;
  created_at: string;
  updated_at: string | null;
  size: string | null;
  color: string | null;
  product_type: string | null;
  variant_group_id: string | null;
  categories: ProductCategory | ProductCategory[] | null;
};

function groupKey(product: Product, variantMode: boolean) {
  if (variantMode && product.product_type === "variant" && product.variant_group_id) {
    return product.variant_group_id;
  }
  return product.id;
}

export default async function ProductsPage() {
  const supabase = await createClient();
  const business = await requirePermission("products.view");

  const currentMode = await getCurrentBusinessMode({
    businessId: business.id,
    productMode: business.productMode,
  });

  const { data: categoryData, error: categoryError } = await supabase
    .from("categories")
    .select("id, name")
    .eq("business_id", business.id)
    .order("name");

  const { data: productData, error: productError } = await supabase
    .from("products")
    .select(`
      id,
      name,
      sku,
      barcode,
      image_url,
      variant_image_url,
      cost_price,
      selling_price,
      stock_quantity,
      low_stock_quantity,
      is_active,
      is_online,
      created_at,
      updated_at,
      size,
      color,
      product_type,
      variant_group_id,
      categories:categories!products_category_same_business_fk (
        name
      )
    `)
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  const categories = (categoryData ?? []) as Category[];
  const products = (productData ?? []) as Product[];
  const businessType = currentMode.value;
  const productMode = currentMode.productMode;
  const variantMode = productMode === "variant";

  const grouped = new Map<string, Product[]>();
  for (const product of products) {
    const key = groupKey(product, variantMode);
    const rows = grouped.get(key) ?? [];
    rows.push(product);
    grouped.set(key, rows);
  }

  const productGroups = Array.from(grouped.values());
  const totalProducts = productGroups.length;
  const activeProducts = productGroups.filter((rows) =>
    rows.some((row) => row.is_active),
  ).length;
  const outOfStock = productGroups.filter(
    (rows) => rows.reduce((sum, row) => sum + Number(row.stock_quantity || 0), 0) === 0,
  ).length;
  const lowStock = productGroups.filter((rows) => {
    const total = rows.reduce((sum, row) => sum + Number(row.stock_quantity || 0), 0);
    return (
      total > 0 &&
      rows.some(
        (row) =>
          Number(row.stock_quantity || 0) <= Number(row.low_stock_quantity || 0),
      )
    );
  }).length;

  const isFashion = businessType === "fashion";
  const isShoes = businessType === "shoes";

  const formMeta = variantMode
    ? {
        title: isFashion
          ? "Add Clothing Style"
          : isShoes
            ? "Add Shoe Style"
            : "Add Variant Product",
        description: isFashion
          ? "Create a clothing style with variants and inventory."
          : isShoes
            ? "Create a shoe style with sizes, colours and inventory."
            : "Create a product with multiple inventory variants.",
        badge: isFashion ? "Fashion mode" : isShoes ? "Shoes mode" : "Variant mode",
        icon: isFashion || isShoes ? <Shirt size={20} /> : <SlidersHorizontal size={20} />,
      }
    : productMode === "configurable"
      ? {
          title: "Add Configurable Product",
          description: "Create a product with selectable options and pricing.",
          badge: "Configurable mode",
          icon: <Settings2 size={20} />,
        }
      : {
          title: "Add Product",
          description: "Create a product and its starting inventory.",
          badge: "Standard mode",
          icon: <Package size={20} />,
        };

  return (
    <main className="min-w-0">
      <div className="grid items-start gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                {formMeta.icon}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-950">{formMeta.title}</h1>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {formMeta.description}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700">
              {formMeta.badge}
            </span>
          </div>

          <div className="p-4">
            {categoryError && (
              <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {categoryError.message}
              </p>
            )}

            {variantMode ? (
              <VariantProductForm categories={categories} businessType={businessType} />
            ) : productMode === "configurable" ? (
              <ConfigurableProductForm categories={categories} businessType={businessType} />
            ) : (
              <StandardProductForm categories={categories} />
            )}
          </div>
        </section>

        <div className="min-w-0 space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <MetricCard
              icon={<Package size={22} />}
              iconClass="bg-blue-50 text-blue-600"
              label="Total Products"
              value={totalProducts}
              hint="Styles and products"
            />
            <MetricCard
              icon={<CheckCircle2 size={22} />}
              iconClass="bg-emerald-50 text-emerald-600"
              label="Active Products"
              value={activeProducts}
              hint={`${totalProducts ? Math.round((activeProducts / totalProducts) * 100) : 0}% of total`}
            />
            <MetricCard
              icon={<AlertTriangle size={22} />}
              iconClass="bg-amber-50 text-amber-600"
              label="Low Stock"
              value={lowStock}
              hint="Items below threshold"
            />
            <MetricCard
              icon={<XCircle size={22} />}
              iconClass="bg-red-50 text-red-600"
              label="Out of Stock"
              value={outOfStock}
              hint="Items with no stock"
            />
          </section>

          {productError ? (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">
              {productError.message}
            </section>
          ) : (
            <ProductList products={products} productMode={productMode} />
          )}
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p>
        </div>
      </div>
    </div>
  );
}
