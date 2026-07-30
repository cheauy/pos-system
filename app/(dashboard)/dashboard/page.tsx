import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { getCurrentBusiness } from
  "@/lib/business/get-current-business";
import { createClient } from
  "@/lib/supabase/server";

type ProductStock = {
  id: string;
  name: string;
  stock_quantity: number;
  low_stock_quantity: number;
};

type TodayOrder = {
  total: number | string | null;
};

type TodayReturn = {
  id: string;
  refund_amount: number | string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const business = await getCurrentBusiness();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    productCountResult,
    categoryCountResult,
    productStockResult,
    todayOrdersResult,
    todayReturnsResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("business_id", business.id),

    supabase
      .from("categories")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("business_id", business.id),

    supabase
      .from("products")
      .select(`
        id,
        name,
        stock_quantity,
        low_stock_quantity
      `)
      .eq("business_id", business.id)
      .eq("is_active", true),

    supabase
      .from("orders")
      .select("total")
      .eq("business_id", business.id)
      .eq("status", "completed")
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString()),

    supabase
      .from("returns")
      .select("id, refund_amount")
      .eq("business_id", business.id)
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString()),
  ]);

  if (productCountResult.error) {
    console.error(
      "Failed to load product count:",
      productCountResult.error.message,
    );
  }

  if (categoryCountResult.error) {
    console.error(
      "Failed to load category count:",
      categoryCountResult.error.message,
    );
  }

  if (productStockResult.error) {
    console.error(
      "Failed to load product stock:",
      productStockResult.error.message,
    );
  }

  if (todayOrdersResult.error) {
    console.error(
      "Failed to load today's orders:",
      todayOrdersResult.error.message,
    );
  }

  if (todayReturnsResult.error) {
    console.error(
      "Failed to load today's returns:",
      todayReturnsResult.error.message,
    );
  }

  const productsStock =
    (productStockResult.data ?? []) as ProductStock[];

  const todayOrders =
    (todayOrdersResult.data ?? []) as TodayOrder[];

  const todayReturns =
    (todayReturnsResult.data ?? []) as TodayReturn[];

  const lowStockProducts = productsStock.filter(
    (product) =>
      product.stock_quantity <=
      product.low_stock_quantity,
  );

  const outOfStockCount = lowStockProducts.filter(
    (product) => product.stock_quantity <= 0,
  ).length;

  const todayOrderCount = todayOrders.length;

  const todaySales = todayOrders.reduce(
    (sum, order) =>
      sum + Number(order.total ?? 0),
    0,
  );

  const todayReturnCount = todayReturns.length;

  const todayRefundAmount = todayReturns.reduce(
    (total, item) =>
      total + Number(item.refund_amount ?? 0),
    0,
  );

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Dashboard
            </h1>

            <p className="mt-1 text-slate-500">
              Welcome, {user.email}
            </p>

            <p className="mt-1 text-sm text-slate-400">
              {business.name} · {formatRole(business.role)}
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Total Products"
            value={productCountResult.count ?? 0}
          />

          <DashboardCard
            title="Categories"
            value={categoryCountResult.count ?? 0}
          />

          <DashboardCard
            title="Today's Orders"
            value={todayOrderCount}
          />

          <Link
            href="/dashboard/low-stock"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-700">
                  Low-stock Products
                </p>

                <p className="mt-2 text-3xl font-bold text-amber-900">
                  {lowStockProducts.length}
                </p>

                <p className="mt-1 text-sm text-amber-700">
                  {outOfStockCount} out of stock
                </p>
              </div>

              <AlertTriangle
                size={30}
                className="text-amber-600"
              />
            </div>
          </Link>

          <DashboardCard
            title="Today's Sales"
            value={`$${todaySales.toFixed(2)}`}
          />

          <DashboardCard
            title="Returns Today"
            value={todayReturnCount}
          />

          <DashboardCard
            title="Refunded Today"
            value={`$${todayRefundAmount.toFixed(2)}`}
          />

          <DashboardCard
            title="Systems Mode"
            value={formatProductMode(
              business.productMode,
            )}
          />
        </div>
      </div>
    </main>
  );
}

function DashboardCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-3 text-3xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function formatRole(role: string) {
  return role
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

function formatProductMode(mode: string) {
  return mode
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}