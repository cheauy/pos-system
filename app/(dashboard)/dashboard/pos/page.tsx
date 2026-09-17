import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  barcode: string | null;
  image_url: string | null;
  variant_image_url: string | null;
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

type ProductOption = {
  id: string;
  product_id: string;
  group_id: string;
  name: string;
  price_adjustment: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

type ProductOptionGroup = {
  id: string;
  product_id: string;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
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
  { data: optionGroupData, error: optionGroupError },
  { data: optionData, error: optionError },
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
      barcode,
      image_url,
      variant_image_url,
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
  supabaseAdmin
    .from("product_option_groups")
    .select("id, product_id, name, selection_type, is_required, min_selections, max_selections, sort_order")
    .eq("business_id", business.id)
    .order("sort_order"),
  supabaseAdmin
    .from("product_options")
    .select("id, product_id, group_id, name, price_adjustment, is_default, is_active, sort_order")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("sort_order"),
]);

 if (
  categoryError ||
  productError ||
  customerError ||
  optionGroupError ||
  optionError
) {
  return (
    <div className="rounded-2xl bg-red-50 p-6 text-red-600">
      {categoryError?.message ||
        productError?.message ||
        customerError?.message ||
        optionGroupError?.message ||
        optionError?.message ||
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
    optionGroups={(optionGroupData ?? []) as ProductOptionGroup[]}
    options={(optionData ?? []) as ProductOption[]}
  />
);
}
