import { createClient } from "@/lib/supabase/server";
import PosClient from "./pos-client";
import {
  requirePermission,
} from "@/lib/auth/require-permission";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  selling_price: number;
  stock_quantity: number;
  category_id: string | null;
  size: string | null;
  color: string | null;
  product_type: string | null;
  variant_group_id: string | null;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

export default async function PosPage() {
  const supabase = await createClient();
  const business = await requirePermission(
  "pos.access",
);
  const [
  { data: categoryData, error: categoryError },
  { data: productData, error: productError },
  { data: customerData, error: customerError },
  { data: storefrontData },
] = await Promise.all([
  supabase
    .from("categories")
    .select("id, name")
    .eq("business_id", business.id)
    .order("name"),

  supabase
    .from("products")
    .select(`
      id,
      name,
      sku,
      image_url,
      selling_price,
      stock_quantity,
      category_id,
      size,
      color,
      product_type,
      variant_group_id
    `)
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("name"),
  supabase
    .from("customers")
    .select("id, name, phone")
    .eq("business_id", business.id)
    .order("name"),
  supabase
    .from("business_storefronts")
    .select("business_type")
    .eq("business_id", business.id)
    .maybeSingle(),
]);

 if (
  categoryError ||
  productError ||
  customerError
) {
  return (
    <div className="rounded-2xl bg-red-50 p-6 text-red-600">
      {categoryError?.message ||
        productError?.message ||
        customerError?.message ||
        "Unable to load the POS screen."}
    </div>
  );
}

return (
  <PosClient
    categories={(categoryData ?? []) as Category[]}
    products={(productData ?? []) as Product[]}
    customers={(customerData ?? []) as Customer[]}
    businessType={storefrontData?.business_type ?? "general"}
  />
);
}
