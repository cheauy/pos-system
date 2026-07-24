import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  BadgeDollarSign,
  RotateCcw,
} from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  

  const { count: productCount } = await supabase
  .from("products")
  .select(`
    id,
    name,
    stock_quantity,
    low_stock_quantity
  `)
const [
  { data: ordersData },
  { data: expensesData },
  { data: productStockData },
] = await Promise.all([
  supabase.from("orders").select("*"),

  supabase.from("expenses").select("*"),

  supabase
    .from("products")
    .select(`
      id,
      name,
      description,
      stock_quantity,
      low_stock_quantity
    `),
]);

type ProductStock = {
  id: string;
  name: string;
  stock_quantity: number;
  low_stock_quantity: number;
};

  const productsStock =
  (productStockData ?? []) as ProductStock[];

const lowStockProducts = productsStock.filter(
  (product) =>
    product.stock_quantity <=
    product.low_stock_quantity,
);

const outOfStockCount = lowStockProducts.filter(
  (product) =>
    product.stock_quantity <= 0,
).length;


const today = new Date();
today.setHours(0, 0, 0, 0);

const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const { data: todayReturnsData, error: todayReturnsError } =
  await supabase
    .from("returns")
    .select("id, refund_amount")
    .gte("created_at", today.toISOString())
    .lt("created_at", tomorrow.toISOString());

if (todayReturnsError) {
  console.error(
    "Failed to load today's returns:",
    todayReturnsError.message,
  );
}

const todayReturns = todayReturnsData ?? [];

const todayReturnCount = todayReturns.length;

const todayRefundAmount = todayReturns.reduce(
  (total, item) =>
    total + Number(item.refund_amount ?? 0),
  0,
);

  const { count: categoryCount } = await supabase
    .from("categories")
    .select("*", {
      count: "exact",
      head: true,
    });

    


const { data: todayOrders } = await supabase
  .from("orders")
  .select("total")
  .eq("status", "completed")
  .gte("created_at", today.toISOString());

const todayOrderCount = todayOrders?.length ?? 0;

const todaySales =
  todayOrders?.reduce(
    (sum, order) => sum + Number(order.total),
    0,
  ) ?? 0;


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
  </div>

 
</div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Total Products"
            value={productCount ?? 0}
          />

          <DashboardCard
            title="Categories"
            value={categoryCount ?? 0}
          />

        <DashboardCard
     title="Today's Orders"
  value={todayOrderCount}
/>

<Link
  href="/dashboard/low-stock"
  className="rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300"
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
  value={todayReturnCount.toString()}
 
/>

<DashboardCard
  title="Refunded Today"
  value={`$${todayRefundAmount.toFixed(2)}`}
 
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