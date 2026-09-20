import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

import SuppliersClient from "./suppliers-client";

type SupplierRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type PurchaseOrderRow = {
  id: string;
  supplier_id: string | null;
  status: string;
  order_date: string;
  total: number | string | null;
};

export default async function SuppliersPage() {
  const business = await requirePermission("suppliers.manage");
  const supabase = await createClient();

  const [supplierResult, purchaseOrderResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select(`
        id,
        name,
        contact_person,
        phone,
        email,
        address,
        notes,
        is_active,
        created_at
      `)
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_orders")
      .select("id,supplier_id,status,order_date,total")
      .eq("business_id", business.id)
      .order("order_date", { ascending: false }),
  ]);

  const suppliers = (supplierResult.data ?? []) as SupplierRow[];
  const purchaseOrders = (purchaseOrderResult.data ?? []) as PurchaseOrderRow[];

  return (
    <SuppliersClient
      suppliers={suppliers}
      purchaseOrders={purchaseOrders}
      loadError={supplierResult.error?.message ?? null}
    />
  );
}
