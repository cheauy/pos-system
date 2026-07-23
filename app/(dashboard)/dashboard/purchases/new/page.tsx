import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import PurchaseForm from "@/app/(dashboard)/dashboard/purchases/new/purchase-form";

type Supplier = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  cost_price: number;
  stock_quantity: number;
};

export default async function NewPurchasePage() {
  const supabase = await createClient();

  const [
    { data: supplierData },
    { data: productData },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("products")
      .select(`
        id,
        name,
        cost_price,
        stock_quantity
      `)
      .order("name"),
  ]);

  const suppliers =
    (supplierData ?? []) as Supplier[];

  const products =
    (productData ?? []) as Product[];

  return (
    <main>
      <Link
        href="/dashboard/purchases"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={17} />
        Back to purchases
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          New Purchase
        </h1>

        <p className="mt-1 text-slate-500">
          Receive products and increase inventory
        </p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          Create at least one product before
          recording a purchase.
        </div>
      ) : (
        <PurchaseForm
          suppliers={suppliers}
          products={products}
          today={getLocalDateString(
            new Date(),
          )}
        />
      )}
    </main>
  );
}

function getLocalDateString(date: Date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}