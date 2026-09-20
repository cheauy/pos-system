import Link from "next/link";
import {
  ArrowLeft,
} from "lucide-react";

import CreatePurchaseForm from "./purchase-form";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

type Supplier = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  cost_price: number;
  stock_quantity: number;
};

export default async function NewPurchasePage() {
  const business =
    await requirePermission(
      "purchases.create",
    );

  const supabase =
    await createClient();

  const [
    {
      data: supplierData,
      error: supplierError,
    },
    {
      data: productData,
      error: productError,
    },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq(
        "business_id",
        business.id,
      )
      .order("name", {
        ascending: true,
      }),

    supabase
      .from("products")
      .select(`
        id,
        name,
        sku,
        cost_price,
        stock_quantity
      `)
      .eq(
        "business_id",
        business.id,
      )
      .eq("is_active", true)
      .order("name", {
        ascending: true,
      }),
  ]);

  if (supplierError) {
    throw new Error(
      `Unable to load suppliers: ${supplierError.message}`,
    );
  }

  if (productError) {
    throw new Error(
      `Unable to load products: ${productError.message}`,
    );
  }

  const suppliers =
    (supplierData ??
      []) as Supplier[];

  const products =
    (productData ??
      []) as Product[];

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
          Receive products from a
          supplier and increase inventory.
        </p>
      </div>

      <CreatePurchaseForm
        suppliers={suppliers}
        products={products}
      />
    </main>
  );
}
