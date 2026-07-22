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

export default async function PosPage() {
  const supabase = await createClient();

  const [
    { data: categoryData, error: categoryError },
    { data: productData, error: productError },
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
  ]);

  if (categoryError || productError) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-red-600">
        {categoryError?.message ||
          productError?.message ||
          "Unable to load the POS screen."}
      </div>
    );
  }

  return (
    <PosClient
      categories={(categoryData ?? []) as Category[]}
      products={(productData ?? []) as Product[]}
    />
  );
}