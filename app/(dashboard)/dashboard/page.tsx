import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarDays,
  CreditCard,
  Package,
  ReceiptText,
  ShoppingCart,
  Store,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { getCurrentBusinessMode } from "@/lib/business/get-current-business-mode";
import DashboardPeriodFilter from "./dashboard-period-filter";
import { createClient } from "@/lib/supabase/server";

type DashboardRange = "today" | "yesterday" | "7d" | "30d" | "365d" | "custom";

type DashboardSearchParams = {
  from?: string | string[];
  to?: string | string[];
  // Legacy query params remain supported for old dashboard links.
  range?: string | string[];
  date?: string | string[];
};

type Stock = {
  id: string;
  name: string;
  stock_quantity: number;
  low_stock_quantity: number;
  cost_price: number;
  size: string | null;
  color: string | null;
  variant_group_id: string | null;
};

type DashboardOrder = {
  id: string;
  order_number: string | null;
  subtotal: number | null;
  discount: number | null;
  delivery_fee: number | null;
  total: number;
  status: string;
  payment_method: string | null;
  order_source: string | null;
  created_at: string;
};

type Line = {
  product_name: string | null;
  quantity: number;
  variant_label: string | null;
  selected_options: unknown;
  orders:
    | {
        status: string;
        business_id: string;
        created_at: string;
        payment_method: string | null;
        order_source: string | null;
      }
    | {
        status: string;
        business_id: string;
        created_at: string;
        payment_method: string | null;
        order_source: string | null;
      }[]
    | null;
};

type TrendBucket = {
  key: string;
  label: string;
  revenue: number;
  orders: number;
};

type Period = {
  range: DashboardRange;
  label: string;
  startKey: string;
  endKeyExclusive: string;
  startIso: string;
  endIso: string;
  days: number;
  selectedFrom: string;
  selectedTo: string;
};

type BreakdownRow = {
  label: string;
  revenue: number;
  orders: number;
};

const UTC_OFFSET_MINUTES = readUtcOffsetMinutes();

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const business = await getCurrentBusiness();
  const canViewReports = hasPermission(business.role, "reports.view");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const period = resolvePeriod(params);
  const previousPeriod = previousComparablePeriod(period);

  const [
    { data: storefront },
    businessMode,
    { data: stocks },
    { data: periodOrders },
    { data: previousOrders },
    { data: recentOrders },
    { data: lines },
  ] = await Promise.all([
    supabase
      .from("business_storefronts")
      .select("currency")
      .eq("business_id", business.id)
      .maybeSingle(),
    getCurrentBusinessMode({
      businessId: business.id,
      productMode: business.productMode,
    }),
    supabase
      .from("products")
      .select(
        "id,name,stock_quantity,low_stock_quantity,cost_price,size,color,variant_group_id",
      )
      .eq("business_id", business.id)
      .eq("is_active", true),
    supabase
      .from("orders")
      .select(
        "id,order_number,subtotal,discount,delivery_fee,total,status,payment_method,order_source,created_at",
      )
      .eq("business_id", business.id)
      .gte("created_at", period.startIso)
      .lt("created_at", period.endIso)
      .order("created_at", { ascending: true })
      .limit(5000),
    supabase
      .from("orders")
      .select(
        "id,order_number,subtotal,discount,delivery_fee,total,status,payment_method,order_source,created_at",
      )
      .eq("business_id", business.id)
      .eq("status", "completed")
      .gte("created_at", previousPeriod.startIso)
      .lt("created_at", previousPeriod.endIso)
      .order("created_at", { ascending: true })
      .limit(5000),
    supabase
      .from("orders")
      .select(
        "id,order_number,subtotal,discount,delivery_fee,total,status,payment_method,order_source,created_at",
      )
      .eq("business_id", business.id)
      .gte("created_at", period.startIso)
      .lt("created_at", period.endIso)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("order_items")
      .select(
        "product_name,quantity,variant_label,selected_options,orders!inner(status,business_id,created_at,payment_method,order_source)",
      )
      .eq("orders.business_id", business.id)
      .eq("orders.status", "completed")
      .gte("orders.created_at", period.startIso)
      .lt("orders.created_at", period.endIso)
      .limit(5000),
  ]);

  const stock = (stocks ?? []) as Stock[];
  const allPeriodOrders = (periodOrders ?? []) as DashboardOrder[];
  const completedOrders = allPeriodOrders.filter(
    (order) => order.status.toLowerCase() === "completed",
  );
  const previousCompleted = (previousOrders ?? []) as DashboardOrder[];
  const recent = (recentOrders ?? []) as DashboardOrder[];
  const soldLines = (lines ?? []) as unknown as Line[];

  const currency = storefront?.currency ?? "USD";

  const revenue = completedOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );
  const previousRevenue = previousCompleted.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );
  const averageOrder = completedOrders.length
    ? revenue / completedOrders.length
    : 0;
  const previousAverage = previousCompleted.length
    ? previousRevenue / previousCompleted.length
    : 0;
  const itemsSold = soldLines.reduce(
    (sum, line) => sum + Math.max(0, Number(line.quantity || 0)),
    0,
  );
  const totalDiscount = completedOrders.reduce(
    (sum, order) => sum + Math.max(0, Number(order.discount || 0)),
    0,
  );
  const completedRate = allPeriodOrders.length
    ? (completedOrders.length / allPeriodOrders.length) * 100
    : 0;

  const lowStock = stock.filter(
    (product) =>
      Number(product.stock_quantity) <= Number(product.low_stock_quantity),
  );
  const inventoryValue = stock.reduce(
    (sum, product) =>
      sum + Number(product.stock_quantity) * Number(product.cost_price),
    0,
  );
  const totalStockUnits = stock.reduce(
    (sum, product) => sum + Math.max(0, Number(product.stock_quantity)),
    0,
  );

  const trend = buildTrendBuckets(period, completedOrders);
  const paymentMix = buildBreakdown(
    completedOrders,
    (order) => formatPayment(order.payment_method),
  );
  const channelMix = buildBreakdown(
    completedOrders,
    (order) => formatSource(order.order_source),
  );
  const topProducts = countBy(
    soldLines,
    (line) => line.product_name || "Product",
  ).slice(0, 6);

  const revenueChange = percentChange(revenue, previousRevenue);
  const orderChange = percentChange(
    completedOrders.length,
    previousCompleted.length,
  );
  const averageChange = percentChange(averageOrder, previousAverage);

  return (
    <main className="mx-auto w-full max-w-[1900px] space-y-6 pb-10">
      <header className="-mx-4 -mt-4 flex min-h-20 items-center border-b border-slate-200 bg-white px-5 py-4 sm:-mx-6 sm:-mt-6 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900">
            <Store size={22} strokeWidth={2.1} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              TENH POS workspace
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <p className="max-w-[14rem] truncate text-sm font-black text-slate-950 sm:max-w-[24rem] sm:text-base dark:text-white">
                {business.name}
              </p>
            </div>
          </div>
        </div>

        <div className="ml-auto hidden items-center gap-3 sm:flex">
          <div className="hidden text-right xl:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Signed in as
            </p>
            <p className="max-w-52 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">
              {user?.email ?? "Account"}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black capitalize text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {business.role}
          </span>
        </div>
      </header>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              <CalendarDays size={14} className="text-blue-600 dark:text-blue-400" />
              <span>{period.label}</span>
            </div>

            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Dashboard
            </h1>

            <div className="mt-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
                <Store size={12} />
                Business mode · {businessMode.shortLabel}
              </span>
            </div>

            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
              Sales, orders, inventory, and product performance for {business.name}.
            </p>
          </div>

          <div className="w-full 2xl:w-auto 2xl:min-w-[700px]">
            <DashboardPeriodFilter
              activeRange={period.range}
              selectedFrom={period.selectedFrom}
              selectedTo={period.selectedTo}
              canViewReports={canViewReports}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <KpiCard
          title="Net sales"
          value={money(revenue, currency)}
          icon={WalletCards}
          tone="blue"
          hint={comparisonText(revenueChange, "previous period")}
        />
        <KpiCard
          title="Completed orders"
          value={completedOrders.length}
          icon={ReceiptText}
          tone="violet"
          hint={comparisonText(orderChange, "previous period")}
        />
        <KpiCard
          title="Average order"
          value={money(averageOrder, currency)}
          icon={averageChange >= 0 ? TrendingUp : TrendingDown}
          tone="emerald"
          hint={comparisonText(averageChange, "previous period")}
        />
        <KpiCard
          title="Items sold"
          value={itemsSold}
          icon={Package}
          tone="slate"
          hint={`${completedRate.toFixed(0)}% order completion rate`}
        />
        <KpiCard
          title="Discounts given"
          value={money(totalDiscount, currency)}
          icon={CreditCard}
          tone="amber"
          hint={
            revenue > 0
              ? `${((totalDiscount / (revenue + totalDiscount)) * 100).toFixed(1)}% of pre-discount sales`
              : "No discount impact in this period"
          }
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <SalesOverview
            buckets={trend}
            revenue={revenue}
            orderCount={completedOrders.length}
            currency={currency}
            periodLabel={period.label}
          />
        </div>
        <div className="xl:col-span-4">
          <OperationalSnapshot
            totalOrders={allPeriodOrders.length}
            completedOrders={completedOrders.length}
            completionRate={completedRate}
            discount={totalDiscount}
            lowStockCount={lowStock.length}
            inventoryValue={inventoryValue}
            currency={currency}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <SalesMix
            paymentMix={paymentMix}
            channelMix={channelMix}
            currency={currency}
          />
        </div>
        <div className="xl:col-span-7">
          <TopProducts rows={topProducts} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <RecentOrders orders={recent} currency={currency} />
        </div>
        <div className="xl:col-span-4">
          <InventoryHealth
            activeProducts={stock.length}
            units={totalStockUnits}
            inventoryValue={inventoryValue}
            lowStock={lowStock}
            currency={currency}
          />
        </div>
      </section>

    </main>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  title: string;
  value: string | number;
  icon: typeof Boxes;
  tone: "blue" | "violet" | "emerald" | "amber" | "slate";
  hint: string;
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
    violet:
      "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300",
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
    amber:
      "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300",
    slate:
      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  }[tone];

  return (
    <article className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="mt-2 truncate text-3xl font-black tracking-tight text-slate-950 dark:text-white">
            {value}
          </p>
          <p className="mt-2 text-xs font-medium text-slate-400">{hint}</p>
        </div>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneClass}`}
        >
          <Icon size={21} strokeWidth={2.1} />
        </span>
      </div>
    </article>
  );
}

function SalesOverview({
  buckets,
  revenue,
  orderCount,
  currency,
  periodLabel,
}: {
  buckets: TrendBucket[];
  revenue: number;
  orderCount: number;
  currency: string;
  periodLabel: string;
}) {
  const maxRevenue = Math.max(1, ...buckets.map((bucket) => bucket.revenue));

  return (
    <section className="h-full rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Sales trend
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Revenue and completed-order activity · {periodLabel}.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-slate-950 dark:text-white">
            {money(revenue, currency)}
          </p>
          <p className="text-xs font-semibold text-slate-400">
            {orderCount} completed {orderCount === 1 ? "order" : "orders"}
          </p>
        </div>
      </div>

      <div className="mt-7 grid h-56 items-end gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, buckets.length)}, minmax(0, 1fr))` }}>
        {buckets.map((bucket) => {
          const height =
            bucket.revenue <= 0
              ? 5
              : Math.max(12, (bucket.revenue / maxRevenue) * 100);
          return (
            <div
              key={bucket.key}
              className="flex h-full min-w-0 flex-col justify-end"
            >
              <div className="flex min-h-0 flex-1 items-end justify-center">
                <div
                  className="w-full max-w-16 rounded-t-xl bg-blue-100 transition dark:bg-blue-950/70"
                  style={{ height: `${height}%` }}
                  title={`${bucket.label}: ${money(bucket.revenue, currency)} · ${bucket.orders} orders`}
                >
                  <div className="h-full w-full rounded-t-xl bg-gradient-to-t from-blue-600 to-blue-400 opacity-90" />
                </div>
              </div>
              <div className="mt-3 min-w-0 text-center">
                <p className="truncate text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {bucket.label}
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                  {bucket.orders}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OperationalSnapshot({
  totalOrders,
  completedOrders,
  completionRate,
  discount,
  lowStockCount,
  inventoryValue,
  currency,
}: {
  totalOrders: number;
  completedOrders: number;
  completionRate: number;
  discount: number;
  lowStockCount: number;
  inventoryValue: number;
  currency: string;
}) {
  return (
    <section className="h-full rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-black text-slate-950 dark:text-white">
        Operational snapshot
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Fast signals that help you spot changes early.
      </p>

      <div className="mt-5 space-y-3">
        <InsightRow
          label="Order completion"
          value={`${completionRate.toFixed(0)}%`}
          detail={`${completedOrders} of ${totalOrders} orders completed`}
          tone={completionRate >= 90 ? "good" : completionRate >= 70 ? "warn" : "bad"}
        />
        <InsightRow
          label="Discount impact"
          value={money(discount, currency)}
          detail="Total discount applied in this period"
          tone="neutral"
        />
        <InsightRow
          label="Low-stock products"
          value={lowStockCount}
          detail={lowStockCount ? "Inventory needs attention" : "No low-stock alerts"}
          tone={lowStockCount ? "warn" : "good"}
        />
        <InsightRow
          label="Inventory value"
          value={money(inventoryValue, currency)}
          detail="Current cost value of active stock"
          tone="neutral"
        />
      </div>
    </section>
  );
}

function InsightRow({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const dotClass = {
    good: "bg-emerald-500",
    warn: "bg-amber-400",
    bad: "bg-red-500",
    neutral: "bg-blue-500",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
          <p className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">
            {label}
          </p>
        </div>
        <p className="shrink-0 text-sm font-black text-slate-950 dark:text-white">
          {value}
        </p>
      </div>
      <p className="mt-1.5 pl-[18px] text-xs font-medium text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function SalesMix({
  paymentMix,
  channelMix,
  currency,
}: {
  paymentMix: BreakdownRow[];
  channelMix: BreakdownRow[];
  currency: string;
}) {
  return (
    <section className="h-full rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-black text-slate-950 dark:text-white">
        Sales mix
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        See where revenue comes from and how customers pay.
      </p>

      <BreakdownList title="Payment methods" rows={paymentMix} currency={currency} />
      <div className="my-5 border-t border-slate-100 dark:border-slate-800" />
      <BreakdownList title="Sales channels" rows={channelMix} currency={currency} />
    </section>
  );
}

function BreakdownList({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: BreakdownRow[];
  currency: string;
}) {
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);

  return (
    <div className="mt-5 first:mt-0">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
        {title}
      </p>
      <div className="mt-3 space-y-3">
        {rows.length ? (
          rows.slice(0, 5).map((row) => {
            const share = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">
                      {row.label}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                      {row.orders} {row.orders === 1 ? "order" : "orders"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      {money(row.revenue, currency)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400">
                      {share.toFixed(0)}%
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.max(4, share)}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-400 dark:bg-slate-950/60">
            No completed sales in this period.
          </p>
        )}
      </div>
    </div>
  );
}

function InventoryHealth({
  activeProducts,
  units,
  inventoryValue,
  lowStock,
  currency,
}: {
  activeProducts: number;
  units: number;
  inventoryValue: number;
  lowStock: Stock[];
  currency: string;
}) {
  return (
    <section className="h-full rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Inventory health
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Current stock position.
          </p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Boxes size={19} />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniStat label="Active products" value={activeProducts} />
        <MiniStat label="Units on hand" value={units} />
        <div className="col-span-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/60">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Stock value
          </p>
          <p className="mt-1.5 text-xl font-black text-slate-950 dark:text-white">
            {money(inventoryValue, currency)}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              size={16}
              className={lowStock.length ? "text-amber-500" : "text-emerald-500"}
            />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              Low-stock alerts
            </p>
          </div>
          <Link
            href="/dashboard/low-stock"
            className="text-xs font-bold text-blue-600 hover:text-blue-700"
          >
            View all
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {lowStock.length ? (
            lowStock.slice(0, 4).map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/20"
              >
                <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {product.name}
                </span>
                <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-black text-amber-700 shadow-sm dark:bg-slate-900 dark:text-amber-300">
                  {Number(product.stock_quantity)} left
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              No low-stock alerts right now.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function RecentOrders({
  orders,
  currency,
}: {
  orders: DashboardOrder[];
  currency: string;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Recent orders
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Latest activity inside the selected analytics period.
          </p>
        </div>
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700"
        >
          View orders <ArrowRight size={15} />
        </Link>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {orders.length ? (
          orders.map((order) => (
            <Link
              key={order.id}
              href={`/dashboard/orders/${order.id}`}
              className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/40 sm:grid-cols-[minmax(0,1.5fr)_0.8fr_0.8fr_0.8fr_auto] sm:items-center sm:px-6"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                  {order.order_number || `Order ${order.id.slice(0, 8)}`}
                </p>
                <p className="mt-0.5 text-xs font-medium text-slate-400">
                  {formatOrderTime(order.created_at)}
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {formatSource(order.order_source)}
              </p>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {formatPayment(order.payment_method)}
              </p>
              <div>
                <StatusBadge status={order.status} />
              </div>
              <p className="text-right text-sm font-black text-slate-950 dark:text-white">
                {money(Number(order.total), currency)}
              </p>
            </Link>
          ))
        ) : (
          <div className="px-6 py-12 text-center">
            <ReceiptText className="mx-auto text-slate-300" size={30} />
            <p className="mt-3 text-sm font-semibold text-slate-500">
              No orders were found in this selected period.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const className =
    normalized === "completed"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : normalized === "cancelled" || normalized === "canceled"
        ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        : normalized === "pending"
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black capitalize ${className}`}
    >
      {status || "Unknown"}
    </span>
  );
}

function TopProducts({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <section className="h-full rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Top-selling items
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Products ranked by units sold in the selected period.
          </p>
        </div>
        <ShoppingCart size={20} className="text-blue-600" />
      </div>

      <div className="mt-5 space-y-3">
        {rows.length ? (
          rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className="rounded-2xl border border-slate-100 p-3.5 dark:border-slate-800"
            >
              <div className="flex items-center gap-3">
                <RankBadge rank={index + 1} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black text-slate-800 dark:text-white">
                      {row.label}
                    </p>
                    <span className="shrink-0 text-xs font-black text-slate-500">
                      {row.value} sold
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${Math.max(8, (row.value / max) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-400 dark:bg-slate-950/60">
            No completed product sales in this period.
          </div>
        )}
      </div>
    </section>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const rankClass =
    rank === 1
      ? "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900"
      : rank === 2
        ? "bg-slate-200 text-slate-700 ring-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600"
        : rank === 3
          ? "bg-[#E8D2BE] text-[#7A4A27] ring-[#D4B494] dark:bg-[#5A3926] dark:text-[#F0D2B4] dark:ring-[#7A4A27]"
          : "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900";

  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ring-1 ${rankClass}`}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

function buildBreakdown(
  orders: DashboardOrder[],
  pick: (order: DashboardOrder) => string,
) {
  const map = new Map<string, BreakdownRow>();

  for (const order of orders) {
    const label = pick(order) || "Other";
    const current = map.get(label) ?? { label, revenue: 0, orders: 0 };
    current.revenue += Number(order.total || 0);
    current.orders += 1;
    map.set(label, current);
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function buildTrendBuckets(period: Period, orders: DashboardOrder[]) {
  if (period.days <= 1) {
    const buckets: TrendBucket[] = Array.from({ length: 6 }, (_, index) => ({
      key: `hour-${index}`,
      label: `${String(index * 4).padStart(2, "0")}:00`,
      revenue: 0,
      orders: 0,
    }));

    for (const order of orders) {
      const hour = localHour(new Date(order.created_at));
      const index = Math.min(5, Math.floor(hour / 4));
      buckets[index].revenue += Number(order.total || 0);
      buckets[index].orders += 1;
    }

    return buckets;
  }

  const keys = localDateKeys(period.startKey, period.days);

  if (period.days <= 7) {
    const buckets = keys.map((key) => ({
      key,
      label: shortDateLabel(key),
      revenue: 0,
      orders: 0,
    }));
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    for (const order of orders) {
      const bucket = byKey.get(localDateKey(new Date(order.created_at)));
      if (!bucket) continue;
      bucket.revenue += Number(order.total || 0);
      bucket.orders += 1;
    }

    return buckets;
  }

  const chunkSize = period.days > 90 ? 30 : period.days > 31 ? 7 : 5;
  const buckets: TrendBucket[] = [];
  for (let index = 0; index < keys.length; index += chunkSize) {
    const chunk = keys.slice(index, index + chunkSize);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    buckets.push({
      key: `${first}-${last}`,
      label: `${compactDateLabel(first)}–${compactDateLabel(last)}`,
      revenue: 0,
      orders: 0,
    });
  }

  for (const order of orders) {
    const key = localDateKey(new Date(order.created_at));
    const dayIndex = keys.indexOf(key);
    if (dayIndex < 0) continue;
    const bucket = buckets[Math.floor(dayIndex / chunkSize)];
    if (!bucket) continue;
    bucket.revenue += Number(order.total || 0);
    bucket.orders += 1;
  }

  return buckets;
}

function countBy(lines: Line[], pick: (line: Line) => string | null) {
  const map = new Map<string, number>();

  for (const line of lines) {
    const value = pick(line);
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + Number(line.quantity || 0));
  }

  return [...map]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function resolvePeriod(params: DashboardSearchParams): Period {
  const today = localDateKey(new Date());
  const requestedFrom = firstParam(params.from);
  const requestedTo = firstParam(params.to);

  if (isDateKey(requestedFrom) || isDateKey(requestedTo)) {
    const first = isDateKey(requestedFrom)
      ? requestedFrom
      : isDateKey(requestedTo)
        ? requestedTo
        : today;
    const second = isDateKey(requestedTo) ? requestedTo : first;
    const startKey = first <= second ? first : second;
    const requestedEnd = first <= second ? second : first;
    // Keep dashboard queries bounded while still supporting a full year of analysis.
    const days = Math.min(366, dateKeySpan(startKey, requestedEnd));
    const endKey = addDateKeyDays(startKey, days - 1);
    const label =
      startKey === endKey
        ? longDateLabel(startKey)
        : `${longDateLabel(startKey)} – ${longDateLabel(endKey)}`;

    return makePeriod(
      "custom",
      label,
      startKey,
      days,
      startKey,
      endKey,
    );
  }

  // Backward compatibility for older bookmarked dashboard filter URLs.
  const rawRange = firstParam(params.range);
  const range: DashboardRange = isDashboardRange(rawRange)
    ? rawRange
    : "today";
  const requestedDate = firstParam(params.date);
  const selectedDate = isDateKey(requestedDate) ? requestedDate : today;

  if (range === "yesterday") {
    const startKey = addDateKeyDays(today, -1);
    return makePeriod(range, "Yesterday", startKey, 1, startKey, startKey);
  }

  if (range === "7d") {
    const startKey = addDateKeyDays(today, -6);
    return makePeriod(range, "Last 7 days", startKey, 7, startKey, today);
  }

  if (range === "30d") {
    const startKey = addDateKeyDays(today, -29);
    return makePeriod(range, "Last 1 month", startKey, 30, startKey, today);
  }

  if (range === "365d") {
    const startKey = addDateKeyDays(today, -364);
    return makePeriod(range, "Last 1 year", startKey, 365, startKey, today);
  }

  if (range === "custom") {
    return makePeriod(
      range,
      longDateLabel(selectedDate),
      selectedDate,
      1,
      selectedDate,
      selectedDate,
    );
  }

  return makePeriod("today", "Today", today, 1, today, today);
}

function makePeriod(
  range: DashboardRange,
  label: string,
  startKey: string,
  days: number,
  selectedFrom: string,
  selectedTo: string,
): Period {
  const endKeyExclusive = addDateKeyDays(startKey, days);
  return {
    range,
    label,
    startKey,
    endKeyExclusive,
    startIso: localDateStartIso(startKey),
    endIso: localDateStartIso(endKeyExclusive),
    days,
    selectedFrom,
    selectedTo,
  };
}

function previousComparablePeriod(period: Period) {
  const previousStart = addDateKeyDays(period.startKey, -period.days);
  const previousEnd = addDateKeyDays(previousStart, period.days - 1);
  return makePeriod(
    period.range,
    "Previous period",
    previousStart,
    period.days,
    previousStart,
    previousEnd,
  );
}

function dateKeySpan(startKey: string, endKey: string) {
  const start = Date.parse(`${startKey}T00:00:00.000Z`);
  const end = Date.parse(`${endKey}T00:00:00.000Z`);
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

function comparisonText(change: number, label: string) {
  if (!Number.isFinite(change)) return "No comparison available";
  if (change === 0) return `No change vs ${label}`;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}% vs ${label}`;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function readUtcOffsetMinutes() {
  const parsed = Number(process.env.TENH_POS_UTC_OFFSET_MINUTES ?? "420");
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 14 * 60) return 420;
  return Math.trunc(parsed);
}

function localDateKey(date: Date) {
  const shifted = new Date(date.getTime() + UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function localHour(date: Date) {
  const shifted = new Date(date.getTime() + UTC_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours();
}

function localDateStartIso(key: string) {
  const utcMidnight = Date.parse(`${key}T00:00:00.000Z`);
  return new Date(utcMidnight - UTC_OFFSET_MINUTES * 60_000).toISOString();
}

function addDateKeyDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateKeys(startKey: string, days: number) {
  return Array.from({ length: days }, (_, index) =>
    addDateKeyDays(startKey, index),
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function isDashboardRange(value: string): value is DashboardRange {
  return ["today", "yesterday", "7d", "30d", "365d", "custom"].includes(value);
}

function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shortDateLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  }).format(new Date(`${key}T00:00:00.000Z`));
}

function compactDateLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00.000Z`));
}

function longDateLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00.000Z`));
}


function formatOrderTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + UTC_OFFSET_MINUTES * 60_000);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(shifted);
}

function formatSource(value: string | null) {
  if (!value) return "POS";
  if (value === "qr") return "QR Order";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPayment(value: string | null) {
  if (!value) return "Unspecified";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}
