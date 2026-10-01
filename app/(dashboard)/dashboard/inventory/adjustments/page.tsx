import { isUuid, MAX_STOCK_ADJUSTMENT_ITEMS } from "@/lib/inventory/stock-adjustment";
import { getBranchContext } from "@/lib/branches/context";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { readAllRows } from "@/lib/supabase/read-all-rows";

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
  variant_image_url: string | null;
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

export default async function StockAdjustmentPage({ searchParams }: { searchParams: Promise<{ product?: string; products?: string; branch?: string; selection?: string }> }) {
  const { product: requestedProduct, products: requestedProducts, branch: requestedBranch, selection } = await searchParams;
  const { branchId: selectedBranch, userId } = await getBranchContext();
  const business = await requirePermission("products.stock_adjust");
  const supabase = await createClient();

  const [productsResult, adjustmentsResult, locationsResult, categoriesResult] = await Promise.all([
    readAllRows((from,to)=>supabase
      .from("branch_products")
      .select(
        "id,name,sku,barcode,image_url,variant_image_url,size,color,stock_quantity,low_stock_quantity,cost_price,selling_price,is_active,updated_at,category_id",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name", { ascending: true }).order("id").range(from,to)),
    supabase
      .from("stock_adjustments")
      .select(
        "*",
      )
      .eq("business_id", business.id)
      .eq("location_id", selectedBranch)
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
  if (locationsResult.error) throw new Error("Unable to load branches.");

  const products = (productsResult.data ?? []) as ProductRow[];
  const adjustments = (adjustmentsResult.data ?? []) as AdjustmentRow[];
  const locations = (locationsResult.data ?? []) as LocationRow[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

  const branch = locations.find(item => item.id === selectedBranch) ?? (!selectedBranch ? locations[0] : undefined);
  if (!branch) throw new Error("Choose an active branch in this business.");
  const productMap = new Map(products.map((product) => [product.id, product]));

  const productViews: AdjustmentProduct[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    imageUrl: product.variant_image_url ?? product.image_url,
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

  // Archived/hidden products leave the picker, but their audit rows still need
  // the saved branch name and variant details, not an anonymous “Product” label.
  const historyProducts = new Map<string, Pick<ProductRow, "id" | "name" | "sku" | "image_url" | "variant_image_url" | "color" | "size">>(products.map(product => [product.id, product]));
  const missingHistoryIds = Array.from(new Set(adjustments.map(row => row.product_id).filter(id => !historyProducts.has(id))));
  if (missingHistoryIds.length) {
    const { data: archivedProducts, error: historyError } = await supabase
      .from("branch_product_details")
      .select("id,name,sku,image_url,variant_image_url,color,size")
      .eq("business_id", business.id).eq("location_id", branch.id).in("id", missingHistoryIds);
    if (historyError) throw new Error("Unable to load archived product names for stock history.");
    for (const product of archivedProducts ?? []) historyProducts.set(product.id, product);
  }

  const recentAdjustments: RecentAdjustment[] = adjustments.filter(adjustment => adjustment.location_id === branch.id || (!adjustment.location_id && branch.is_default)).map((adjustment) => {
    const product = historyProducts.get(adjustment.product_id);
    return {
      id: adjustment.id,
      productId: adjustment.product_id,
      productName: product?.name ?? "Product",
      sku: product?.sku ?? null,
      imageUrl: product?.variant_image_url ?? product?.image_url ?? null,
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

  const requestedIds = Array.from(new Set((requestedProducts || requestedProduct || "").split(",").filter(Boolean)));
  const branchMismatch = Boolean(requestedBranch && requestedBranch !== branch.id);
  const invalidSelection = requestedIds.length > MAX_STOCK_ADJUSTMENT_ITEMS || requestedIds.some(id => !isUuid(id)) || Boolean(selection && !isUuid(selection));
  const selectedIds = branchMismatch || invalidSelection ? [] : requestedIds.filter(id => productMap.has(id));
  const selectionError = branchMismatch ? "Your branch changed. Select products again for this branch."
    : invalidSelection ? "The product selection is invalid or too large. Select products again."
    : selectedIds.length < requestedIds.length ? `${requestedIds.length - selectedIds.length} selected items are hidden, removed or unavailable in this branch.` : "";

  return (
    <StockAdjustmentClient
      products={productViews}
      recentAdjustments={recentAdjustments}
      branchName={branch.name}
      branchId={branch.id}
      key={branch.id}
      initialProductIds={selectedIds}
      initialSelectionToken={!branchMismatch && !invalidSelection ? selection : undefined}
      initialSelectionError={selectionError}
      recoveryKey={`stock-adjustment:${business.id}:${userId}:${branch.id}`}
    />
  );
}
