import { getBranchContext, getViewingBranchId } from "@/lib/branches/context";
import ViewBranchSelect from "@/components/view-branch-select";
import {soldVariant} from "@/lib/analytics/product-variants";
import SalesTrendChart from "./sales-trend-chart";
import {DonutBreakdown,ProductRankBars} from "@/components/analytics-charts";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  CreditCard,
  Package,
  ReceiptText,
  Store,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { getCurrentBusinessMode } from "@/lib/business/get-current-business-mode";
import DashboardPeriodFilter from "./dashboard-period-filter";
import { createClient } from "@/lib/supabase/server";

type DashboardRange = "today" | "yesterday" | "7d" | "30d" | "365d" | "custom";

type DashboardSearchParams = {
  branch?: string | string[];
  from?: string | string[];
  to?: string | string[];
  // Legacy query params remain supported for old dashboard links.
  range?: string | string[];
  date?: string | string[];
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
  product_id:string|null;
  products:{size:string|null;color:string|null}|null;
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
  const canViewReports = await businessHasPermission(business, "reports.view");
  const branchContext = await getBranchContext();
  const requestedBranch = typeof params.branch === "string" ? params.branch : undefined;
  const branchId = await getViewingBranchId(requestedBranch);
  const branches = branchContext.branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    is_active: branch.is_active,
  }));

  // Keep Supabase RLS and the visible dashboard branch in the same context.
  // For Owners viewing all branches, omit x-tenh-branch-id intentionally.
  const analyticsHeaders: Record<string, string> = {
    "x-tenh-business-id": business.id,
  };
  if (branchId) analyticsHeaders["x-tenh-branch-id"] = branchId;
  const supabase = await createClient(analyticsHeaders);

  const period = resolvePeriod(params);
  const previousPeriod = previousComparablePeriod(period);

  const [
    { data: storefront },
    businessMode,
    { data: periodOrders, error: periodError },
    { data: previousOrders, error: previousError },
    { data: recentOrders, error: recentError },
    { data: lines, error: linesError },
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
      .from("orders")
      .select(
        "id,order_number,subtotal,discount,delivery_fee,total,status,payment_method,order_source,created_at",
      )
      .eq("business_id", business.id)
      .match(branchId?{location_id:branchId}:{})
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
      .match(branchId?{location_id:branchId}:{})
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
      .match(branchId?{location_id:branchId}:{})
      .gte("created_at", period.startIso)
      .lt("created_at", period.endIso)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("order_items")
      .select(
        "product_id,product_name,quantity,variant_label,selected_options,products(size,color),orders!inner(status,business_id,location_id,created_at,payment_method,order_source)",
      )
      .eq("orders.business_id", business.id)
      .match(branchId?{"orders.location_id":branchId}:{})
      .eq("orders.status", "completed")
      .gte("orders.created_at", period.startIso)
      .lt("orders.created_at", period.endIso)
      .limit(5000),
  ]);

  const analyticsErrors = [
    periodError ? `current orders (${periodError.code ?? "unknown"}): ${periodError.message}` : null,
    previousError ? `previous orders (${previousError.code ?? "unknown"}): ${previousError.message}` : null,
    recentError ? `recent orders (${recentError.code ?? "unknown"}): ${recentError.message}` : null,
    linesError ? `order items (${linesError.code ?? "unknown"}): ${linesError.message}` : null,
  ].filter((value): value is string => Boolean(value));
  if (analyticsErrors.length) console.warn('[dashboard analytics]', { businessId: business.id, branchId, errors: analyticsErrors });

  // Reporting queries are non-critical. A failed dataset must not throw or call
  // console.error from a Server Component because Next.js promotes server errors
  // into the development overlay. Failed datasets render as unavailable/zero.
  const allPeriodOrders = (periodError ? [] : periodOrders ?? []) as DashboardOrder[];
  const completedOrders = allPeriodOrders.filter(
    (order) => order.status.toLowerCase() === "completed",
  );
  const previousCompleted = (previousError ? [] : previousOrders ?? []) as DashboardOrder[];
  const recent = (recentError ? [] : recentOrders ?? []) as DashboardOrder[];
  const soldLines = (linesError ? [] : lines ?? []) as unknown as Line[];

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
  const completedRate=allPeriodOrders.length?completedOrders.length/allPeriodOrders.length*100:0;
  const trend = buildTrendBuckets(period, completedOrders);
  const paymentMix = buildBreakdown(
    completedOrders,
    (order) => formatPayment(order.payment_method),
  );
  const channelMix = buildBreakdown(
    completedOrders,
    (order) => formatSource(order.order_source),
  );
  const variantSales=new Map<string,{label:string;value:number}>();
  for(const line of soldLines){const variant=soldVariant(line);const row=variantSales.get(variant.key)||{label:variant.label,value:0};row.value+=Number(line.quantity)||0;variantSales.set(variant.key,row);}
  const topProducts=[...variantSales.values()].sort((a,b)=>b.value-a.value).slice(0,10);

  const revenueChange = percentChange(revenue, previousRevenue);
  const orderChange = percentChange(
    completedOrders.length,
    previousCompleted.length,
  );
  const averageChange = percentChange(averageOrder, previousAverage);

  return (
    <main className="mx-auto w-full max-w-[1900px] space-y-6 pb-10">


      {analyticsErrors.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Some dashboard analytics are temporarily unavailable. POS, orders, and inventory remain usable. Refresh this page to try the analytics again.
        </section>
      ) : null}

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="relative min-w-0 sm:pr-64">
            <div className="mb-4 flex flex-col items-end gap-3 sm:absolute sm:right-0 sm:top-0"><ViewBranchSelect branches={branches || []} branchId={branchId}/>
            {canViewReports&&<Link href={`/dashboard/reports?range=custom&from=${period.selectedFrom}&to=${period.selectedTo}${branchId?`&branch=${branchId}`:""}`} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700">View Report</Link>}</div>
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

          <div className="w-full border-t border-slate-100 pt-4">
            <DashboardPeriodFilter
              activeRange={period.range}
              selectedFrom={period.selectedFrom}
              selectedTo={period.selectedTo}
              canViewReports={canViewReports}
              branches={branches||[]} branchId={branchId}
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

      <section className="grid items-start gap-5 xl:grid-cols-12">
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
          <TopProducts rows={topProducts}/>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"><SalesMix paymentMix={paymentMix} channelMix={channelMix} currency={currency}/><RecentOrders orders={recent} currency={currency}/></div>




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

      <SalesTrendChart buckets={buckets} currency={currency}/>
    </section>
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

function BreakdownList({title,rows,currency}:{title:string;rows:BreakdownRow[];currency:string}){return <div className="mt-4"><h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</h3><DonutBreakdown rows={rows.map(r=>({label:r.label,value:r.revenue}))} currency={currency}/></div>;}

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

function TopProducts({rows}:{rows:{label:string;value:number}[]}){return <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-black text-slate-950 dark:text-white">Top-Selling Products</h2><p className="mb-5 mt-1 text-sm text-slate-500">Products ranked by quantity sold</p><ProductRankBars rows={rows}/></section>;}


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
    : "yesterday";
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
