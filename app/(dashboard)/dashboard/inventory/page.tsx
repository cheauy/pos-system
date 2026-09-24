import { getBranchContext } from "@/lib/branches/context";
import { createClient } from "@/lib/supabase/branch-server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { requirePermission } from "@/lib/auth/require-permission";
import InventoryClient from "./inventory-client";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  variant_image_url: string | null;
  category_id: string | null;
  stock_quantity: number;
  low_stock_quantity: number;
  cost_price: number;
  selling_price: number;
  size: string | null;
  color: string | null;
  is_active: boolean;
  updated_at: string | null;
};

type CategoryRow = { id: string; name: string };
type LocationRow = { id: string; name: string; code: string };
type LocationStockRow = {
  location_id: string;
  product_id: string;
  quantity: number;
  low_stock_threshold: number;
};
type SoldLine = { product_id: string | null; quantity: number };

export default async function InventoryPage() {
  const business = await requirePermission("inventory.view");
  const {branchId}=await getBranchContext();
  const supabase = await createClient();

  const movementStart = new Date();
  movementStart.setDate(movementStart.getDate() - 30);

  const [
    { data: productData, error: productError },
    { data: categoryData, error: categoryError },
    { data: locationData, error: locationError },
    { data: locationStockData, error: locationStockError },
    { data: soldLineData, error: soldLineError },
  ] = await Promise.all([
    readAllRows((from,to)=>supabase
      .from("branch_products")
      .select(
        "id,name,sku,barcode,image_url,variant_image_url,category_id,stock_quantity,low_stock_quantity,cost_price,selling_price,size,color,is_active,updated_at",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .order("id").range(from,to)),
    supabase
      .from("categories")
      .select("id,name")
      .eq("business_id", business.id)
      .order("name", { ascending: true }),
    supabase
      .from("business_locations")
      .select("id,name,code")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .eq("id", branchId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),
    readAllRows((from,to)=>supabase
      .from("product_location_stock")
      .select("location_id,product_id,quantity,low_stock_threshold")
      .eq("business_id", business.id)
      .eq("location_id", branchId)
      .order("product_id").range(from,to)),
    readAllRows((from,to)=>supabase
      .from("order_items")
      .select("product_id,quantity,orders!inner(business_id,status,created_at,location_id)")
      .eq("orders.business_id", business.id)
      .eq("orders.location_id", branchId)
      .eq("orders.status", "completed")
      .gte("orders.created_at", movementStart.toISOString())
      .order("id").range(from,to)),
  ]);

  const loadError =
    productError ??
    categoryError ??
    locationError ??
    locationStockError;

  if (loadError) {
    return (
      <main>
        <h1 className="text-3xl font-bold text-slate-950">Advanced Inventory</h1>
        <p className="mt-1 text-slate-500">
          Track stock levels, low-stock alerts and inventory across branches.
        </p>
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Unable to load inventory: {loadError.message}
        </div>
      </main>
    );
  }

  const soldByProduct = new Map<string, number>();
  for (const row of (soldLineData ?? []) as unknown as SoldLine[]) {
    if (!row.product_id) continue;
    soldByProduct.set(
      row.product_id,
      (soldByProduct.get(row.product_id) ?? 0) + Math.max(0, Number(row.quantity || 0)),
    );
  }

  const products = ((productData ?? []) as ProductRow[]).map((product) => ({
    ...product,
    sold_30d: soldByProduct.get(product.id) ?? 0,
  }));

  return (
    <>
    {soldLineError && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Sales activity could not load. Your inventory quantities are available.</p>}
    <InventoryClient
      defaultBranchId={branchId}
      products={products}
      categories={(categoryData ?? []) as CategoryRow[]}
      locations={(locationData ?? []) as LocationRow[]}
      locationStock={(locationStockData ?? []) as LocationStockRow[]}
    />
    </>
  );
}
