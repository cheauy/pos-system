import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

import { readAllRows } from "@/lib/supabase/read-all-rows";

import PurchaseOrderForm from "./purchase-order-form";

type SupplierRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  cost_price: number | string | null;
  size: string | null;
  color: string | null;
};

export default async function NewPurchaseOrderPage() {
  const business = await requirePermission("purchases.create");
  const supabase = await createClient();

  const [suppliersResult, productsResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id,name,contact_person,phone,email,address,notes,is_active",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name"),
    readAllRows<ProductRow>((from, to) => supabase
      .from("branch_products")
      .select("id,name,sku,barcode,cost_price,size,color")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name").order("id").range(from, to)),
  ]);

  if (suppliersResult.error || productsResult.error) {
    console.error("Purchase order catalog failed", suppliersResult.error || productsResult.error);
    return <main role="alert" className="rounded-xl border border-red-200 p-6">Unable to load purchase order products or suppliers. Refresh to try again.</main>;
  }

  return (
    <main>
      {!productsResult.data?.length && <p role="status" className="mb-4 rounded-xl border border-amber-200 p-4">No active products in this branch. Add or assign products in Products before creating a purchase order.</p>}
      <PurchaseOrderForm
        suppliers={(suppliersResult.data ?? []) as SupplierRow[]}
        products={(productsResult.data ?? []) as ProductRow[]}
      />
    </main>
  );
}
