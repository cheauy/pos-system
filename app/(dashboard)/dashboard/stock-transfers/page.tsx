import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";

import StockTransfersClient, {
  type TransferLocation,
  type TransferLocationStock,
  type TransferProduct,
  type TransferRow,
} from "./stock-transfers-client";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  image_url: string | null;
  stock_quantity: number;
  category_id: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
};

type TransferDbRow = {
  id: string;
  transfer_number: string;
  status: string;
  source_location_id: string;
  destination_location_id: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
  stock_transfer_items:
    | { product_id: string; quantity: number }[]
    | null;
};

export default async function StockTransfersPage() {
  const [business, supabase] = await Promise.all([requirePermission("transfers.manage"), createClient()]);

  const [
    locationsResult,
    productsResult,
    categoriesResult,
    transfersResult,
    stockResult,
  ] = await Promise.all([
    supabase
      .from("business_locations")
      .select("id, name")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    // Paged so the picker lists every active product, not just the first 500.
    readAllRows<ProductRow>((from, to) => supabase
      .from("products")
      .select(
        "id, name, sku, size, color, image_url, stock_quantity, category_id",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .order("id")
      .range(from, to)),
    supabase
      .from("categories")
      .select("id, name")
      .eq("business_id", business.id)
      .order("name", { ascending: true }),
    supabase
      .from("stock_transfers")
      .select(
        "id, transfer_number, status, source_location_id, destination_location_id, note, created_at, created_by, stock_transfer_items(product_id, quantity)",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200),
    // Display-only availability for every branch; sending re-reads stock on the
    // server. Paged so businesses past the row cap see every balance.
    readAllRows<{ location_id: string; product_id: string; quantity: number }>((from, to) => supabase
      .from("product_location_stock")
      .select("location_id, product_id, quantity")
      .eq("business_id", business.id)
      .order("location_id")
      .order("product_id")
      .range(from, to)),
  ]);

  if (locationsResult.error) {
    throw new Error(
      `Unable to load branches: ${locationsResult.error.message}`,
    );
  }

  if (productsResult.error) {
    throw new Error(
      `Unable to load products: ${productsResult.error.message}`,
    );
  }

  if (transfersResult.error) {
    throw new Error(
      `Unable to load stock transfers: ${transfersResult.error.message}`,
    );
  }

  if (stockResult.error) throw new Error("Unable to load source branch stock.");
  const locations: TransferLocation[] = (locationsResult.data ?? []).map(
    (location) => ({
      id: location.id,
      name: location.name,
    }),
  );

  const categoryMap = new Map(
    ((categoriesResult.data ?? []) as CategoryRow[]).map((category) => [
      category.id,
      category.name,
    ]),
  );

  const products: TransferProduct[] = (
    (productsResult.data ?? []) as ProductRow[]
  ).map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    size: product.size,
    color: product.color,
    imageUrl: product.image_url,
    categoryId: product.category_id,
    categoryName:
      (product.category_id
        ? categoryMap.get(product.category_id)
        : null) ?? "Uncategorized",
    businessStock: Number(product.stock_quantity ?? 0),
  }));

  const transfers: TransferRow[] = (
    (transfersResult.data ?? []) as TransferDbRow[]
  ).map((transfer) => ({
    id: transfer.id,
    transferNumber: transfer.transfer_number,
    status: transfer.status,
    sourceLocationId: transfer.source_location_id,
    destinationLocationId: transfer.destination_location_id,
    note: transfer.note,
    createdAt: transfer.created_at,
    createdBy: transfer.created_by,
    items: (transfer.stock_transfer_items ?? []).map((item) => ({
      productId: item.product_id,
      quantity: Number(item.quantity ?? 0),
    })),
  }));

  const locationStock: TransferLocationStock[] = stockResult.error
    ? []
    : (stockResult.data ?? []).map((row) => ({
        locationId: row.location_id,
        productId: row.product_id,
        quantity: Number(row.quantity ?? 0),
      }));

  return (
    <StockTransfersClient
      locations={locations}
      products={products}
      locationStock={locationStock}
      transfers={transfers}
    />
  );
}
