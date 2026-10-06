import { getBranchContext } from "@/lib/branches/context";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
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
  const [supabase, {branchId}] = await Promise.all([createClient(), getBranchContext()]);

  // Branch stock, products, categories and settings are independent: read them
  // together, paging the lists so large catalogs are not truncated.
  const [stock, productResult, categoryResult, settingsResult] = await Promise.all([
    readAllRows<{ product_id: string; quantity: number }>((from, to) => supabase.from("product_location_stock").select("product_id,quantity").eq("business_id",business.id).eq("location_id",branchId).order("product_id").range(from, to)),
    readAllRows<ProductRow>((from, to) => supabase
      .from("branch_products")
      .select(
        "id,name,sku,barcode,image_url,variant_image_url,cost_price,selling_price,stock_quantity,size,color,category_id,is_active",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name")
      .order("id")
      .range(from, to)),
    supabase
      .from("categories")
      .select("id,name")
      .eq("business_id", business.id)
      .order("name"),
    supabase
        .from("branch_receipt_settings")
        .select("*")
        .eq("business_id", business.id)
        .eq("location_id",branchId)
      .maybeSingle(),
  ]);

  if(stock.error) throw new Error("Unable to load branch products.");
  const assigned = new Map((stock.data ?? []).map(row=>[row.product_id,Number(row.quantity)]));
  if(settingsResult.error)throw new Error('Unable to load saved barcode settings. Please retry.');
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
