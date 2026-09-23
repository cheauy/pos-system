import Link from "next/link";
import {
  BadgePercent,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Filter,
  Gift,
  Globe2,
  Lightbulb,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  TicketPercent,
  Trash2,
  UsersRound,
} from "lucide-react";

import { requirePermission } from "@/lib/auth/require-permission";
import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { createClient } from "@/lib/supabase/branch-server";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import {
  createCoupon,
  deleteCoupon,
  setCouponActive,
  updateLoyaltySettings,
} from "./actions";

type Coupon = {
  id: string;
  code: string;
  name: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  minimum_order: number;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  usage_count: number;
  is_active: boolean;
  created_at: string;
};

type PromotionOrder = {
  customer_id: string | null;
  discount: number | null;
  coupon_code: string | null;
  status: string;
  created_at: string;
};

type PromotionsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    page?: string;
    tab?: string;
  }>;
};

const PAGE_SIZE = 10;
const tabs = [
  { key: "all", label: "All Campaigns" },
  { key: "coupons", label: "Coupon Campaigns" },
  { key: "loyalty", label: "Loyalty Program" },
  { key: "automations", label: "Automations" },
  { key: "reports", label: "Reports" },
] as const;

export default async function PromotionsPage({
  searchParams,
}: PromotionsPageProps) {
  const params = await searchParams;
  const business = await requirePermission("storefront.view");
  const scopedDb=await createClient();

  const [settings, couponResult, orderResult] = await Promise.all([
    getStorefrontSettings(business.id),
    scopedDb
      .from("business_coupons")
      .select(`
        id,
        code,
        name,
        discount_type,
        discount_value,
        minimum_order,
        max_discount,
        starts_at,
        ends_at,
        usage_limit,
        per_customer_limit,
        usage_count,
        is_active,
        created_at
      `)
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    scopedDb
      .from("orders")
      .select("customer_id,discount,coupon_code,status,created_at")
      .eq("business_id", business.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(10000),
  ]);

  if (couponResult.error) {
    throw new Error(`Unable to load promotions: ${couponResult.error.message}`);
  }

  const coupons = (couponResult.data ?? []) as Coupon[];
  const orders = orderResult.error
    ? []
    : ((orderResult.data ?? []) as PromotionOrder[]);
  const canEdit = await businessHasPermission(business, "storefront.update");

  const now = Date.now();
  const activeCount = coupons.filter(
    (coupon) => getCouponStatus(coupon, now) === "active",
  ).length;
  const totalCouponUses = coupons.reduce(
    (sum, coupon) => sum + Number(coupon.usage_count ?? 0),
    0,
  );
  const totalDiscountGiven = orders.reduce(
    (sum, order) => sum + Number(order.discount ?? 0),
    0,
  );
  const customerOrderCounts = new Map<string, number>();
  for (const order of orders) {
    if (!order.customer_id) continue;
    customerOrderCounts.set(
      order.customer_id,
      (customerOrderCounts.get(order.customer_id) ?? 0) + 1,
    );
  }
  const loyalCustomerCount = [...customerOrderCounts.values()].filter(
    (count) => count >= 2,
  ).length;

  const query = params.q?.trim().toLowerCase() ?? "";
  const status = ["all", "active", "scheduled", "paused", "expired"].includes(
    params.status ?? "",
  )
    ? (params.status as "all" | "active" | "scheduled" | "paused" | "expired")
    : "all";
  const sort = ["newest", "oldest", "most-used", "ending-soon"].includes(
    params.sort ?? "",
  )
    ? params.sort!
    : "newest";
  const tab = tabs.some((item) => item.key === params.tab)
    ? params.tab!
    : "all";

  let filteredCoupons = coupons.filter((coupon) => {
    const matchesQuery =
      !query ||
      coupon.code.toLowerCase().includes(query) ||
      (coupon.name ?? "").toLowerCase().includes(query) ||
      formatCouponValue(coupon, settings.currency).toLowerCase().includes(query);

    const couponStatus = getCouponStatus(coupon, now);
    const matchesStatus = status === "all" || couponStatus === status;
    return matchesQuery && matchesStatus;
  });

  filteredCoupons = [...filteredCoupons].sort((first, second) => {
    if (sort === "oldest") {
      return new Date(first.created_at).getTime() - new Date(second.created_at).getTime();
    }
    if (sort === "most-used") {
      return Number(second.usage_count) - Number(first.usage_count);
    }
    if (sort === "ending-soon") {
      const firstEnd = first.ends_at ? new Date(first.ends_at).getTime() : Number.MAX_SAFE_INTEGER;
      const secondEnd = second.ends_at ? new Date(second.ends_at).getTime() : Number.MAX_SAFE_INTEGER;
      return firstEnd - secondEnd;
    }
    return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
  });

  const requestedPage = Number(params.page ?? "1");
  const totalPages = Math.max(1, Math.ceil(filteredCoupons.length / PAGE_SIZE));
  const currentPage = Math.min(
    Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1),
    totalPages,
  );
  const pageCoupons = filteredCoupons.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const firstShown = filteredCoupons.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, filteredCoupons.length);

  return (
    <main className="space-y-4 pb-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">
            Promotions & Loyalty
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Run coupon campaigns, loyalty programs and reward repeat customers from one place.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href="#promotion-tips"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <PlayCircle size={17} className="text-blue-600" />
            How it works?
          </a>
          {canEdit ? (
            <details className="group relative">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                <Plus size={17} />
                Create New
                <ChevronDown size={15} className="ml-1 transition group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <a href="#create-coupon" className={menuItemClass}>
                  <TicketPercent size={16} /> Coupon campaign
                </a>
                <a href="#loyalty-settings" className={menuItemClass}>
                  <Gift size={16} /> Loyalty settings
                </a>
              </div>
            </details>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          icon={<TicketPercent size={23} />}
          iconClass="bg-blue-50 text-blue-600"
          label="Active Promotions"
          value={activeCount.toLocaleString()}
          hint="Running now"
        />
        <MetricCard
          icon={<UsersRound size={23} />}
          iconClass="bg-indigo-50 text-indigo-600"
          label="Loyal Customers"
          value={loyalCustomerCount.toLocaleString()}
          hint="2+ completed orders"
        />
        <MetricCard
          icon={<BadgePercent size={23} />}
          iconClass="bg-pink-50 text-pink-600"
          label="Total Coupons Used"
          value={totalCouponUses.toLocaleString()}
          hint="All-time redemptions"
        />
        <MetricCard
          icon={<CircleDollarSign size={23} />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Total Discount Given"
          value={formatMoney(totalDiscountGiven, settings.currency)}
          hint="Completed orders"
        />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200">
              <nav className="flex min-w-max overflow-x-auto px-3" aria-label="Promotion sections">
                {tabs.map((item) => {
                  const active = item.key === tab;
                  return (
                    <Link
                      key={item.key}
                      href={buildHref({
                        q: params.q,
                        status,
                        sort,
                        tab: item.key,
                        page: 1,
                      })}
                      className={`relative px-4 py-4 text-sm font-semibold transition ${
                        active
                          ? "text-blue-600"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {item.label}
                      {active ? (
                        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue-600" />
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {tab === "all" || tab === "coupons" ? (
              <>
                <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-end">
                  <form method="get" className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                    <input type="hidden" name="tab" value={tab} />
                    <div className="relative min-w-0 sm:w-[320px]">
                      <Search
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        name="q"
                        defaultValue={params.q ?? ""}
                        placeholder="Search campaign name, code or discount..."
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                      />
                    </div>
                    <label className="relative">
                      <Filter
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <select
                        name="status"
                        defaultValue={status}
                        className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-blue-400"
                      >
                        <option value="all">All status</option>
                        <option value="active">Active</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="paused">Paused</option>
                        <option value="expired">Expired</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    </label>
                    <label className="relative">
                      <select
                        name="sort"
                        defaultValue={sort}
                        className="h-10 appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-blue-400"
                      >
                        <option value="newest">Sort: Newest</option>
                        <option value="oldest">Sort: Oldest</option>
                        <option value="most-used">Sort: Most used</option>
                        <option value="ending-soon">Sort: Ending soon</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    </label>
                    <button
                      type="submit"
                      className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Apply
                    </button>
                  </form>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-12 px-4 py-3">
                          <input type="checkbox" aria-label="Select all campaigns" className="h-4 w-4 rounded border-slate-300" />
                        </th>
                        <th className="px-2 py-3">Campaign</th>
                        <th className="px-3 py-3">Type</th>
                        <th className="px-3 py-3">Discount</th>
                        <th className="px-3 py-3">Usage / Limit</th>
                        <th className="px-3 py-3">Period</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Channels</th>
                        <th className="w-16 px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pageCoupons.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-14 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                              <BadgePercent size={24} />
                            </div>
                            <p className="mt-3 font-semibold text-slate-800">No campaigns found</p>
                            <p className="mt-1 text-sm text-slate-500">
                              Try another search or create a new coupon campaign.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        pageCoupons.map((coupon, index) => {
                          const couponStatus = getCouponStatus(coupon, now);
                          const used = Number(coupon.usage_count ?? 0);
                          const limit = coupon.usage_limit ? Number(coupon.usage_limit) : null;
                          const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;

                          return (
                            <tr key={coupon.id} className="bg-white transition hover:bg-slate-50/60">
                              <td className="px-4 py-3 align-middle">
                                <input type="checkbox" aria-label={`Select ${coupon.name || coupon.code}`} className="h-4 w-4 rounded border-slate-300" />
                              </td>
                              <td className="px-2 py-3">
                                <div className="flex items-center gap-3">
                                  <CampaignIcon index={index} code={coupon.code} />
                                  <div className="min-w-0">
                                    <p className="max-w-[220px] truncate font-semibold text-slate-900">
                                      {coupon.name || coupon.code}
                                    </p>
                                    <p className="mt-0.5 max-w-[240px] truncate text-xs text-slate-500">
                                      Code · {coupon.code}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className="inline-flex rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                  Coupon
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <p className="font-semibold text-slate-900">
                                  {formatCouponValue(coupon, settings.currency)}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {Number(coupon.minimum_order) > 0
                                    ? `Min. order ${formatMoney(Number(coupon.minimum_order), settings.currency)}`
                                    : "No minimum order"}
                                </p>
                              </td>
                              <td className="px-3 py-3">
                                <div className="w-32">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-slate-700">
                                      {used.toLocaleString()} / {limit ? limit.toLocaleString() : "∞"}
                                    </span>
                                    {percent !== null ? <span className="text-slate-400">{percent}%</span> : null}
                                  </div>
                                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full bg-emerald-500"
                                      style={{ width: `${percent ?? Math.min(100, used > 0 ? 22 : 0)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-xs text-slate-600">
                                <div className="flex items-start gap-1.5">
                                  <CalendarDays size={14} className="mt-0.5 shrink-0 text-slate-400" />
                                  <span className="whitespace-nowrap leading-5">
                                    {formatWindowLines(coupon.starts_at, coupon.ends_at).map((line) => (
                                      <span key={line} className="block">{line}</span>
                                    ))}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <StatusBadge status={couponStatus} />
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
                                  <span className="inline-flex items-center gap-1.5">
                                    <Globe2 size={15} className="text-slate-500" />
                                    Online
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {canEdit ? (
                                  <details className="relative inline-block text-left">
                                    <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
                                      <MoreHorizontal size={17} />
                                    </summary>
                                    <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
                                      <form action={setCouponActive}>
                                        <input type="hidden" name="couponId" value={coupon.id} />
                                        <input type="hidden" name="active" value={String(!coupon.is_active)} />
                                        <button type="submit" className={menuButtonClass}>
                                          {coupon.is_active ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
                                          {coupon.is_active ? "Pause campaign" : "Enable campaign"}
                                        </button>
                                      </form>
                                      <form action={deleteCoupon}>
                                        <input type="hidden" name="couponId" value={coupon.id} />
                                        <button type="submit" className={`${menuButtonClass} text-red-600 hover:bg-red-50`}>
                                          <Trash2 size={15} />
                                          {coupon.usage_count > 0 ? "Archive campaign" : "Delete campaign"}
                                        </button>
                                      </form>
                                    </div>
                                  </details>
                                ) : (
                                  <span className="text-xs text-slate-400">View</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Showing {firstShown}–{lastShown} of {filteredCoupons.length} campaigns
                  </p>
                  <div className="flex items-center gap-2">
                    <Link
                      aria-disabled={currentPage <= 1}
                      href={buildHref({ q: params.q, status, sort, tab, page: Math.max(1, currentPage - 1) })}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 ${
                        currentPage <= 1 ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <ChevronLeft size={15} />
                    </Link>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-2 text-xs font-semibold text-blue-700">
                      {currentPage}
                    </span>
                    <Link
                      aria-disabled={currentPage >= totalPages}
                      href={buildHref({ q: params.q, status, sort, tab, page: Math.min(totalPages, currentPage + 1) })}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 ${
                        currentPage >= totalPages ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <ChevronRight size={15} />
                    </Link>
                    <span className="ml-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                      10 / page
                    </span>
                  </div>
                </div>
              </>
            ) : tab === "loyalty" ? (
              <TabPlaceholder
                icon={<Gift size={24} />}
                title="Loyalty program controls"
                description="Use the Loyalty Program panel on the right to configure earning rules and minimum order settings."
              />
            ) : tab === "automations" ? (
              <TabPlaceholder
                icon={<Clock3 size={24} />}
                title="Promotion automations"
                description="This area is ready for birthday, win-back and customer-segment automations when those rules are connected."
              />
            ) : (
              <TabPlaceholder
                icon={<Sparkles size={24} />}
                title="Campaign reports"
                description="Campaign usage and discount totals are already summarized above. Deeper campaign analytics can live here next."
              />
            )}
          </section>

          <section
            id="promotion-tips"
            className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-blue-700">
              <Lightbulb size={19} />
              <h2 className="text-sm font-bold">Tips for better results</h2>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <TipCard icon={<Tag size={16} />} title="Use clear and simple codes" text="Easy codes are easier to remember." />
              <TipCard icon={<Clock3 size={16} />} title="Set a reasonable time period" text="Create urgency with limited-time offers." />
              <TipCard icon={<UsersRound size={16} />} title="Target the right customers" text="Match the offer to the campaign goal." />
              <TipCard icon={<Sparkles size={16} />} title="Track performance" text="Watch usage and discount totals." />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section id="loyalty-settings" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Gift size={19} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Online store loyalty settings (shared)</h2>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    Turn repeat customers into loyal fans.
                  </p>
                </div>
              </div>
              <span className={`relative mt-1 h-5 w-9 rounded-full ${settings.loyalty_enabled ? "bg-blue-600" : "bg-slate-200"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${settings.loyalty_enabled ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </div>

            <form action={updateLoyaltySettings} className="mt-4 space-y-2.5">
              <SwitchRow
                name="enableCoupons"
                label="Enable coupon codes"
                description="Show coupon entry at online checkout."
                defaultChecked={settings.enable_coupons}
                disabled={!canEdit}
                icon={<TicketPercent size={16} />}
                iconClass="bg-blue-50 text-blue-600"
              />
              <SwitchRow
                name="loyaltyEnabled"
                label="Enable loyalty points"
                description="Earn points on completed purchases."
                defaultChecked={settings.loyalty_enabled}
                disabled={!canEdit}
                icon={<Gift size={16} />}
                iconClass="bg-violet-50 text-violet-600"
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="text-xs font-semibold text-slate-600">
                  Spend / point
                  <input
                    name="spendPerPoint"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={Number(settings.loyalty_spend_per_point ?? 1)}
                    disabled={!canEdit}
                    className={compactInputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Minimum order
                  <input
                    name="loyaltyMinimumOrder"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={Number(settings.loyalty_minimum_order ?? 0)}
                    disabled={!canEdit}
                    className={compactInputClass}
                  />
                </label>
              </div>

              {canEdit ? (
                <button
                  type="submit"
                  className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <Check size={16} />
                  Save Loyalty Settings
                </button>
              ) : null}
            </form>
          </section>

          {canEdit ? (
            <section id="create-coupon" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <TicketPercent size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Create Coupon Campaign</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Create a code customers can redeem online.</p>
                </div>
              </div>

              <form action={createCoupon} className="mt-4 space-y-3">
                <label className={fieldLabelClass}>
                  Campaign name
                  <input
                    name="name"
                    maxLength={120}
                    placeholder="e.g. Welcome Discount"
                    className={compactInputClass}
                  />
                </label>

                <label className={fieldLabelClass}>
                  Coupon code
                  <input
                    name="code"
                    required
                    minLength={3}
                    maxLength={30}
                    placeholder="e.g. WELCOME10"
                    className={`${compactInputClass} uppercase`}
                  />
                </label>

                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <label className={fieldLabelClass}>
                    Discount type
                    <select name="discountType" defaultValue="percentage" className={compactInputClass}>
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  </label>
                  <label className={fieldLabelClass}>
                    Value
                    <input
                      name="discountValue"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="10"
                      className={compactInputClass}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className={fieldLabelClass}>
                    Minimum order
                    <input name="minimumOrder" type="number" min="0" step="0.01" defaultValue="0" className={compactInputClass} />
                  </label>
                  <label className={fieldLabelClass}>
                    Max discount
                    <input name="maxDiscount" type="number" min="0.01" step="0.01" placeholder="Optional" className={compactInputClass} />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className={fieldLabelClass}>
                    Total usage limit
                    <input name="usageLimit" type="number" min="1" step="1" placeholder="Unlimited" className={compactInputClass} />
                  </label>
                  <label className={fieldLabelClass}>
                    Per customer limit
                    <input name="perCustomerLimit" type="number" min="1" step="1" placeholder="Unlimited" className={compactInputClass} />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className={fieldLabelClass}>
                    Starts
                    <input name="startsAt" type="datetime-local" className={compactInputClass} />
                  </label>
                  <label className={fieldLabelClass}>
                    Ends
                    <input name="endsAt" type="datetime-local" className={compactInputClass} />
                  </label>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-600">Applicable to</span>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5 font-medium text-blue-700">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border-4 border-blue-600 bg-white" />
                      All products
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-400" title="Product targeting is not connected yet">
                      <span className="h-4 w-4 rounded-full border border-slate-300" />
                      Selected products
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-600">Channels</span>
                  <div className="mt-2 flex items-center gap-4 text-xs font-medium text-slate-600">
                    <span className="inline-flex items-center gap-1.5 text-slate-400" title="POS coupon redemption is not connected yet">
                      <Store size={15} /> POS
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-blue-700">
                      <ShoppingBag size={15} /> Online store
                    </span>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                  Activate campaign now
                </label>

                <button
                  type="submit"
                  className="h-10 w-full rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  Create Campaign
                </button>
              </form>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

const compactInputClass =
  "mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 disabled:text-slate-400";
const fieldLabelClass = "block text-xs font-semibold text-slate-600";
const menuItemClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";
const menuButtonClass =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";

function MetricCard({
  icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3.5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-500">{label}</p>
          <div className="mt-0.5 flex flex-wrap items-end gap-x-2 gap-y-1">
            <p className="text-2xl font-bold tracking-tight text-slate-950">{value}</p>
            <span className="mb-0.5 text-[11px] font-medium text-emerald-600">{hint}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignIcon({ index, code }: { index: number; code: string }) {
  const styles = [
    "bg-gradient-to-br from-red-500 to-red-600 text-white",
    "bg-gradient-to-br from-pink-400 to-pink-500 text-white",
    "bg-gradient-to-br from-violet-500 to-indigo-600 text-white",
    "bg-gradient-to-br from-blue-500 to-cyan-500 text-white",
    "bg-gradient-to-br from-amber-400 to-orange-500 text-white",
    "bg-gradient-to-br from-emerald-500 to-green-600 text-white",
  ];
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-black shadow-sm ${styles[index % styles.length]}`}>
      {code.slice(0, 4)}
    </div>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof getCouponStatus> }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700",
    scheduled: "bg-blue-50 text-blue-700",
    paused: "bg-orange-50 text-orange-700",
    expired: "bg-rose-50 text-rose-700",
  } as const;
  const labels = {
    active: "Active",
    scheduled: "Scheduled",
    paused: "Paused",
    expired: "Expired",
  } as const;
  const dots = {
    active: "bg-emerald-500",
    scheduled: "bg-blue-500",
    paused: "bg-orange-500",
    expired: "bg-rose-500",
  } as const;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[status]}`} />
      {labels[status]}
    </span>
  );
}

function SwitchRow({
  name,
  label,
  description,
  defaultChecked,
  disabled,
  icon,
  iconClass,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-800">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          disabled={disabled}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-blue-600 peer-disabled:opacity-50" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function TipCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-blue-100 bg-white/90 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-blue-700">{title}</p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{text}</p>
      </div>
    </div>
  );
}

function TabPlaceholder({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        {icon}
      </div>
      <h2 className="mt-4 font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function getCouponStatus(coupon: Coupon, now: number) {
  if (!coupon.is_active) return "paused" as const;
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
    return "scheduled" as const;
  }
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) {
    return "expired" as const;
  }
  return "active" as const;
}

function formatCouponValue(coupon: Coupon, currency: string) {
  const value = Number(coupon.discount_value);
  const base =
    coupon.discount_type === "percentage"
      ? `${value.toFixed(value % 1 ? 2 : 0)}%`
      : formatMoney(value, currency);

  return coupon.max_discount && coupon.discount_type === "percentage"
    ? `${base} · max ${formatMoney(Number(coupon.max_discount), currency)}`
    : base;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "KHR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatWindowLines(start: string | null, end: string | null) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  if (!start && !end) return ["Ongoing"];
  if (start && end) {
    return [formatter.format(new Date(start)), `→ ${formatter.format(new Date(end))}`];
  }
  if (start) return [`Starts ${formatter.format(new Date(start))}`];
  return [`Ends ${formatter.format(new Date(end!))}`];
}

function buildHref({
  q,
  status,
  sort,
  tab,
  page,
}: {
  q?: string;
  status?: string;
  sort?: string;
  tab?: string;
  page?: number;
}) {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (status && status !== "all") search.set("status", status);
  if (sort && sort !== "newest") search.set("sort", sort);
  if (tab && tab !== "all") search.set("tab", tab);
  if (page && page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/dashboard/promotions?${query}` : "/dashboard/promotions";
}
