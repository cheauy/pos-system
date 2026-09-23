import { getBranchContext } from "@/lib/branches/context";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  XCircle,
} from "lucide-react";

import ProductList from "@/components/product-list";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentBusinessMode } from "@/lib/business/get-current-business-mode";
import { createClient } from "@/lib/supabase/server";
import AddProductModal from "./add-product-modal";

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

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { branch: requestedBranch } = await searchParams;
  const { branchId: operatingBranchId } = await getBranchContext();
  const selectedBranch = requestedBranch === "all" ? "" : requestedBranch ?? operatingBranchId;
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
  const { data: branches, error: branchError } = await supabase.from("business_locations").select("id,name").eq("business_id", business.id).eq("is_active", true).order("is_default", { ascending: false }).order("name");
  if (branchError) throw new Error("Unable to load product branches.");
  const branch = branches?.find(row => row.id === selectedBranch);
  if (selectedBranch && !branch) throw new Error("Branch not found in this business.");
  let products = (productData ?? []) as Product[];
  if (branch) {
    const { data: stock, error: stockError } = await supabase.from("product_location_stock").select("product_id,quantity,low_stock_threshold").eq("business_id", business.id).eq("location_id", branch.id);
    if (stockError) throw new Error("Unable to load branch inventory.");
    const { count: locationCount, error: countError } = await supabase.from("business_locations").select("id", { count: "exact", head: true }).eq("business_id", business.id);
    if (countError) throw new Error("Unable to verify branch inventory.");
    const byProduct = new Map((stock ?? []).map(row => [row.product_id, row]));
    products = products.filter(product=>locationCount===1||byProduct.has(product.id)).map(product => ({ ...product, stock_quantity: locationCount === 1 ? product.stock_quantity : Math.min(product.stock_quantity, byProduct.get(product.id)?.quantity ?? 0), low_stock_quantity: byProduct.get(product.id)?.low_stock_threshold ?? product.low_stock_quantity }));
  }
  const businessType = currentMode.value;
  const productMode = currentMode.productMode;
  const variantMode = productMode === "variant";
  const groupVariantProducts = variantMode || businessType === "general";

  const grouped = new Map<string, Product[]>();
  for (const product of products) {
    const key = groupKey(product, groupVariantProducts);
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


  return (
    <main className="min-w-0 space-y-5">

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Products</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage products, variants, pricing and inventory.
          </p>
        </div>

        <AddProductModal
          categories={categories}
          branches={branches || []}
          businessType={businessType}
          productMode={productMode}
        />
      </header>

      {categoryError && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          Unable to load product categories. You can still view products, but adding or editing a category may be unavailable until this is resolved.
        </section>
      )}

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
            <ProductList products={products} productMode={productMode} branches={branches||[]} branchId={branch?.id||""} businessType={businessType} />
          )}
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
