"use server";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import type { PurchaseOrderListItem, PurchaseOrderSupplier } from "./purchase-orders-client";

export type PurchaseFilters = {page: number; search: string; statusFilter: string; supplierFilter: string; fromDate: string; toDate: string; sortMode: string};
export type PurchaseWorkspace = {
  orders: PurchaseOrderListItem[]; suppliers: PurchaseOrderSupplier[]; total: number; page: number;
  stats: {total: number; draft: number; sent: number; partial: number; completed: number; outstanding: number};
};
export async function loadPurchaseOrders(filters?: PurchaseFilters): Promise<PurchaseWorkspace> {
  const business = await requirePermission("purchases.view");
  const db = await createClient();
  const {data,error} = await db.rpc("tenh_purchase_orders_page", {
    p_business: business.id, p_page: Math.max(1, Math.min(10000, Math.trunc(Number(filters?.page) || 1))),
    p_query: String(filters?.search ?? "").trim().slice(0,200), p_status: filters?.statusFilter || "all",
    p_supplier: filters?.supplierFilter && filters.supplierFilter !== "all" ? filters.supplierFilter : null,
    p_from: filters?.fromDate || null, p_to: filters?.toDate || null, p_sort: filters?.sortMode || "newest",
  });
  if (error || !data) throw new Error("Unable to load purchase orders. Please try again.");
  return data as PurchaseWorkspace;
}
