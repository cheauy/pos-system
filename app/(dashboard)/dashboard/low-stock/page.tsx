import { readAllRows } from "@/lib/supabase/read-all-rows";
import { getBranchContext } from "@/lib/branches/context";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

import LowStockClient, {
  type LowStockActivity,
  type LowStockRow,
} from "./low-stock-client";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  stock_quantity: number;
  low_stock_quantity: number;
  cost_price: number;
};

type LocationRow = {
  id: string;
  name: string;
  is_default: boolean;
};

type LocationStockRow = {
  location_id: string;
  product_id: string;
  quantity: number;
  low_stock_threshold: number;
  updated_at: string;
};

type SupplierRow = {
  id: string;
  name: string;
};

type PurchaseOrderItemRow = {
  product_id: string;
  unit_cost: number;
  received_quantity: number;
  updated_at: string;
  purchase_orders:
    | {
        supplier_id: string | null;
        supplier_name: string | null;
        status: string;
        updated_at: string;
      }
    | {
        supplier_id: string | null;
        supplier_name: string | null;
        status: string;
        updated_at: string;
      }[]
    | null;
};

type StockAdjustmentRow = {
  id: string;
  product_id: string;
  adjustment_type: string;
  quantity_delta: number;
  stock_after: number;
  reason: string;
  created_at: string;
  products:
    | { name: string | null; sku: string | null }
    | { name: string | null; sku: string | null }[]
    | null;
};

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}


function reorderQuantity(stock: number, threshold: number) {
  const safeThreshold = Math.max(0, threshold);
  const target = safeThreshold > 0 ? safeThreshold * 2 : 1;
  return Math.max(1, target - Math.max(0, stock));
}

function statusFor(stock: number, threshold: number): LowStockRow["status"] {
  if (stock <= 0) return "out_of_stock";
  if (threshold > 0 && stock <= Math.max(1, Math.floor(threshold * 0.25))) {
    return "critical";
  }
  return "low_stock";
}

export default async function LowStockPage() {
  const business = await requirePermission("inventory.view");
  const supabase = await createClient();
  const {branchId}=await getBranchContext();

  const [
    productsResult,
    locationsResult,
    locationStockResult,
    suppliersResult,
    poItemsResult,
    adjustmentsResult,
  ] = await Promise.all([
    readAllRows<ProductRow>((from, to) => supabase
      .from("branch_products")
      .select(
        "id, name, sku, image_url, stock_quantity, low_stock_quantity, cost_price",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name", { ascending: true }).order("id").range(from, to)),
    supabase
      .from("business_locations")
      .select("id, name, is_default")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),
    readAllRows<LocationStockRow>((from, to) => supabase
      .from("product_location_stock")
      .select("location_id, product_id, quantity, low_stock_threshold, updated_at")
      .eq("business_id", business.id).eq("location_id", branchId).order("product_id").range(from, to)),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("purchase_order_items")
      .select(
        "product_id, unit_cost, received_quantity, updated_at, purchase_orders!inner(supplier_id, supplier_name, status, updated_at)",
      )
      .eq("business_id", business.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("stock_adjustments")
      .select(
        "id, product_id, adjustment_type, quantity_delta, stock_after, reason, created_at, products(name, sku)",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .eq("location_id",branchId).limit(12),
  ]);

  if (productsResult.error || locationsResult.error || locationStockResult.error) {
    console.error("Low stock data failed", productsResult.error || locationsResult.error || locationStockResult.error);
    return <main role="alert" className="rounded-xl border border-red-200 p-6">Unable to load branch inventory. Refresh to try again.</main>;
  }

  const products = (productsResult.data ?? []) as ProductRow[];
  const locations = ((locationsResult.data ?? []) as LocationRow[]).filter(b=>b.id===branchId);
  const locationStock = ((locationStockResult.data ?? []) as LocationStockRow[]).filter(s=>s.location_id===branchId);
  const suppliers = (suppliersResult.data ?? []) as SupplierRow[];
  const poItems = (poItemsResult.data ?? []) as PurchaseOrderItemRow[];
  const adjustments = (adjustmentsResult.data ?? []) as StockAdjustmentRow[];

  const productMap = new Map(products.map((product) => [product.id, product]));
  const locationMap = new Map(locations.map((location) => [location.id, location]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

  const latestSupplierByProduct = new Map<
    string,
    {
      id: string | null;
      name: string | null;
      unitCost: number | null;
      lastRestockedAt: string | null;
    }
  >();

  for (const item of poItems) {
    const po = singleRelation(item.purchase_orders);
    if (!po || po.status === "cancelled") continue;

    const existing = latestSupplierByProduct.get(item.product_id);
    const supplierName =
      (po.supplier_id ? supplierMap.get(po.supplier_id) : null) ||
      po.supplier_name?.trim() ||
      null;

    const receivedAt = item.received_quantity > 0 ? item.updated_at : null;

    if (!existing) {
      latestSupplierByProduct.set(item.product_id, {
        id: po.supplier_id,
        name: supplierName,
        unitCost: Number.isFinite(Number(item.unit_cost)) ? Number(item.unit_cost) : null,
        lastRestockedAt: receivedAt,
      });
      continue;
    }

    if (!existing.lastRestockedAt && receivedAt) {
      existing.lastRestockedAt = receivedAt;
    }
  }

  const rows: LowStockRow[] = [];
  const seenProductLocations = new Set<string>();

  for (const stock of locationStock) {
    const product = productMap.get(stock.product_id);
    if (!product) continue;

    const currentStock = Number(stock.quantity ?? 0);
    const threshold = Number(stock.low_stock_threshold ?? product.low_stock_quantity ?? 0);

    if (currentStock > threshold) continue;

    const supplier = latestSupplierByProduct.get(product.id);
    const suggestedQuantity = reorderQuantity(currentStock, threshold);
    const unitCost = supplier?.unitCost ?? Number(product.cost_price ?? 0);
    const location = locationMap.get(stock.location_id);

    rows.push({
      id: `${product.id}:${stock.location_id}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      imageUrl: product.image_url,
      branchId: stock.location_id,
      branchName: location?.name ?? "Unknown branch",
      currentStock,
      reorderLevel: threshold,
      suggestedReorder: suggestedQuantity,
      unitCost,
      estimatedValue: suggestedQuantity * Math.max(0, unitCost),
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      lastRestockedAt: supplier?.lastRestockedAt ?? null,
      status: statusFor(currentStock, threshold),
    });

    seenProductLocations.add(`${product.id}:${stock.location_id}`);
  }

  rows.sort((a, b) => {
    const priority = { out_of_stock: 0, critical: 1, low_stock: 2 } as const;
    return priority[a.status] - priority[b.status] || a.currentStock - b.currentStock;
  });

  const activities: LowStockActivity[] = adjustments.map((adjustment) => {
    const product = singleRelation(adjustment.products);
    return {
      id: adjustment.id,
      productName: product?.name?.trim() || "Product",
      sku: product?.sku ?? null,
      quantityDelta: Number(adjustment.quantity_delta ?? 0),
      stockAfter: Number(adjustment.stock_after ?? 0),
      reason: adjustment.reason,
      adjustmentType: adjustment.adjustment_type,
      createdAt: adjustment.created_at,
    };
  });

  const loadError =
    suppliersResult.error?.message ||
    poItemsResult.error?.message ||
    adjustmentsResult.error?.message ||
    null;

  return (
    <LowStockClient
      rows={rows}
      branches={locations.map((location) => ({ id: location.id, name: location.name }))}
      suppliers={suppliers}
      activities={activities}
      loadError={loadError}
    />
  );
}
