import { createClient } from "@/lib/supabase/server";
import PosClient from "./pos-client";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  selling_price: number;
  stock_quantity: number;
  category_id: string | null;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

export default async function PosPage() {
  const supabase = await createClient();

  const [
  { data: categoryData, error: categoryError },
  { data: productData, error: productError },
  { data: customerData, error: customerError },
] = await Promise.all([
  supabase
    .from("categories")
    .select("id, name")
    .order("name"),

  supabase
    .from("products")
    .select(`
      id,
      name,
      sku,
      barcode,
      selling_price,
      stock_quantity,
      category_id
    `)
    .eq("is_active", true)
    .order("name"),

  supabase
    .from("customers")
    .select("id, name, phone")
    .order("name"),
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
  />
);
}