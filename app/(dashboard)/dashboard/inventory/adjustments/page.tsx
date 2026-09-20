import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

import StockAdjustmentClient, {
  type AdjustmentProduct,
  type RecentAdjustment,
} from "./stock-adjustment-client";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  size: string | null;
  color: string | null;
  stock_quantity: number;
  low_stock_quantity: number;
  cost_price: number;
  selling_price: number;
  is_active: boolean;
  updated_at: string | null;
  category_id: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
};

type AdjustmentRow = {
  location_id?: string | null;
  id: string;
  product_id: string;
  adjustment_type: string;
  quantity_delta: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  reference: string | null;
  created_at: string;
};

type LocationRow = {
  id: string;
  name: string;
  is_default: boolean;
};

export default async function StockAdjustmentPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { branch: selectedBranch } = await searchParams;
  const business = await requirePermission("products.stock_adjust");
  const supabase = await createClient();

  const [productsResult, adjustmentsResult, locationsResult, categoriesResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,name,sku,barcode,image_url,size,color,stock_quantity,low_stock_quantity,cost_price,selling_price,is_active,updated_at,category_id",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("stock_adjustments")
      .select(
        "*",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("business_locations")
      .select("id,name,is_default")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id,name")
      .eq("business_id", business.id)
      .order("name", { ascending: true }),
  ]);

  if (productsResult.error) {
    throw new Error(`Unable to load products: ${productsResult.error.message}`);
  }
  if (adjustmentsResult.error) {
    throw new Error(
      `Unable to load stock adjustments: ${adjustmentsResult.error.message}`,
    );
  }
  if (categoriesResult.error) {
    throw new Error(`Unable to load categories: ${categoriesResult.error.message}`);
  }

  let products = (productsResult.data ?? []) as ProductRow[];
  const adjustments = (adjustmentsResult.data ?? []) as AdjustmentRow[];
  const locations = (locationsResult.data ?? []) as LocationRow[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

  const branch = locations.find(item => item.id === selectedBranch) ?? (!selectedBranch ? locations[0] : undefined);
  if (!branch) throw new Error("Choose an active branch in this business.");
  const { data: branchStock, error: stockError } = await supabase.from("product_location_stock").select("product_id,quantity").eq("business_id", business.id).eq("location_id", branch.id);
  const { count: locationCount } = await supabase.from("business_locations").select("id", { count: "exact", head: true }).eq("business_id", business.id);
  if (stockError) throw new Error("Unable to load branch stock.");
  const stockMap = new Map((branchStock ?? []).map(item => [item.product_id, item.quantity]));
  if (locationCount !== 1) products = products.map(product => ({ ...product, stock_quantity: stockMap.get(product.id) ?? 0 }));
  const productMap = new Map(products.map((product) => [product.id, product]));

  const productViews: AdjustmentProduct[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    imageUrl: product.image_url,
    size: product.size,
    color: product.color,
    stockQuantity: Number(product.stock_quantity ?? 0),
    lowStockQuantity: Number(product.low_stock_quantity ?? 0),
    costPrice: Number(product.cost_price ?? 0),
    sellingPrice: Number(product.selling_price ?? 0),
    isActive: Boolean(product.is_active),
    updatedAt: product.updated_at,
    categoryName: product.category_id
      ? categoryMap.get(product.category_id) ?? "Uncategorized"
      : "Uncategorized",
  }));

  const recentAdjustments: RecentAdjustment[] = adjustments.filter(adjustment => adjustment.location_id === branch.id || (!adjustment.location_id && branch.is_default)).map((adjustment) => {
    const product = productMap.get(adjustment.product_id);
    return {
      id: adjustment.id,
      productId: adjustment.product_id,
      productName: product?.name ?? "Product",
      sku: product?.sku ?? null,
      imageUrl: product?.image_url ?? null,
      size: product?.size ?? null,
      color: product?.color ?? null,
      adjustmentType: adjustment.adjustment_type,
      quantityDelta: Number(adjustment.quantity_delta ?? 0),
      stockBefore: Number(adjustment.stock_before ?? 0),
      stockAfter: Number(adjustment.stock_after ?? 0),
      reason: adjustment.location_id ? adjustment.reason : `[Legacy business-wide] ${adjustment.reason}`,
      reference: adjustment.reference,
      createdAt: adjustment.created_at,
    };
  });

  return (
    <><form className="mb-4 flex items-center gap-3 rounded-xl border bg-white p-4"><label>Branch<select name="branch" defaultValue={branch.id} className="ml-3 rounded-lg border p-2">{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="rounded-lg bg-blue-600 px-4 py-2 text-white">View branch</button></form><StockAdjustmentClient
      products={productViews}
      recentAdjustments={recentAdjustments}
      branchName={branch.name}
      branchId={branch.id}
      key={branch.id}
    /></>
  );
}
