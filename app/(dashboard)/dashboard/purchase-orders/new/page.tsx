import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

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

  const [{ data: suppliers }, { data: products }] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id,name,contact_person,phone,email,address,notes,is_active",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id,name,sku,barcode,cost_price,size,color")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <main>
      <PurchaseOrderForm
        suppliers={(suppliers ?? []) as SupplierRow[]}
        products={(products ?? []) as ProductRow[]}
      />
    </main>
  );
}
