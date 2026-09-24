import { getBranchContext } from "@/lib/branches/context";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import BarcodeLabelsClient from "./barcode-labels-client";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  variant_image_url: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  size: string | null;
  color: string | null;
  category_id: string | null;
  is_active: boolean;
};

type CategoryRow = {
  id: string;
  name: string;
};

export default async function BarcodeLabelsPage() {
  const business = await requirePermission("products.view");
  const supabase = await createClient();
  const {branchId}=await getBranchContext();
  const stock = await supabase.from("product_location_stock").select("product_id,quantity").eq("business_id",business.id).eq("location_id",branchId);
  if(stock.error) throw new Error("Unable to load branch products.");
  const assigned = new Map((stock.data ?? []).map(row=>[row.product_id,Number(row.quantity)]));

  const [productResult, categoryResult, settingsResult] = await Promise.all([
    supabase
      .from("branch_products")
      .select(
        "id,name,sku,barcode,image_url,variant_image_url,cost_price,selling_price,stock_quantity,size,color,category_id,is_active",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("categories")
      .select("id,name")
      .eq("business_id", business.id)
      .order("name"),
    supabase
      .from("branch_receipt_settings")
      .select("*")
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  if (productResult.error) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-600">
        {productResult.error.message}
      </div>
    );
  }

  if (categoryResult.error) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-600">
        {categoryResult.error.message}
      </div>
    );
  }

  return (
    <BarcodeLabelsClient
      businessName={business.name}
      products={((productResult.data ?? []) as ProductRow[]).filter(p=>assigned.has(p.id)).map(p=>({...p,stock_quantity:assigned.get(p.id) ?? 0}))}
      categories={(categoryResult.data ?? []) as CategoryRow[]}
      settings={settingsResult.data ?? {}}
    />
  );
}
