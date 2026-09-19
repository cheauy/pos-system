import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BadgePercent,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Gift,
  Globe2,
  Megaphone,
  Repeat2,
  ShoppingBag,
  Store,
  TicketPercent,
  UserRoundPlus,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { requirePermission } from "@/lib/auth/require-permission";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CustomerRow = {
  id: string;
  created_at: string;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  total: number;
  discount: number;
  status: string;
  order_source: string;
  created_at: string;
};

type CouponRow = {
  id: string;
  code: string;
  name: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  minimum_order: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  is_active: boolean;
  created_at: string;
};

type CouponStatus = "Active" | "Scheduled" | "Paused" | "Expired";

export default async function MarketingPage() {
  const business = await requirePermission("business.view");
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [settings, customersResult, ordersResult, couponsResult] = await Promise.all([
    getStorefrontSettings(business.id),
    supabase
      .from("customers")
      .select("id,created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("orders")
      .select("id,customer_id,total,discount,status,order_source,created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabaseAdmin
      .from("business_coupons")
      .select(
        "id,code,name,discount_type,discount_value,minimum_order,starts_at,ends_at,usage_limit,usage_count,is_active,created_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (customersResult.error) {
    throw new Error(`Unable to load marketing customers: ${customersResult.error.message}`);
  }
  if (ordersResult.error) {
    throw new Error(`Unable to load marketing orders: ${ordersResult.error.message}`);
  }
  if (couponsResult.error) {
    throw new Error(`Unable to load marketing campaigns: ${couponsResult.error.message}`);
  }

  const customers = (customersResult.data ?? []) as CustomerRow[];
  const orders = (ordersResult.data ?? []) as OrderRow[];
  const coupons = (couponsResult.data ?? []) as CouponRow[];
  const completedOrders = orders.filter((order) => order.status.toLowerCase() === "completed");

  const customerActivity = new Map<
    string,
    { orderCount: number; totalSpent: number; lastOrderAt: string }
  >();

  for (const order of completedOrders) {
    if (!order.customer_id) continue;
    const current = customerActivity.get(order.customer_id) ?? {
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: order.created_at,
    };
    current.orderCount += 1;
    current.totalSpent += Number(order.total ?? 0);
    if (new Date(order.created_at).getTime() > new Date(current.lastOrderAt).getTime()) {
      current.lastOrderAt = order.created_at;
    }
    customerActivity.set(order.customer_id, current);
  }

  const newCustomers = customers.filter(
    (customer) => new Date(customer.created_at).getTime() >= monthStart.getTime(),
  ).length;
  const repeatCustomers = [...customerActivity.values()].filter(
    (activity) => activity.orderCount >= 2,
  ).length;
  const activeCustomers = [...customerActivity.values()].filter(
    (activity) => new Date(activity.lastOrderAt).getTime() >= thirtyDaysAgo.getTime(),
  ).length;
  const lapsedCustomers = [...customerActivity.values()].filter(
    (activity) => new Date(activity.lastOrderAt).getTime() < sixtyDaysAgo.getTime(),
  ).length;

  const activeCoupons = coupons.filter((coupon) => getCouponStatus(coupon, now) === "Active");
  const monthOrders = completedOrders.filter(
    (order) => new Date(order.created_at).getTime() >= monthStart.getTime(),
  );
  const discountGiven = monthOrders.reduce(
    (sum, order) => sum + Math.max(0, Number(order.discount ?? 0)),
    0,
  );
  const onlineOrdersThisMonth = monthOrders.filter(
    (order) => order.order_source === "online" || order.order_source === "qr",
  ).length;

  const setupItems = [
    {
      label: "Online storefront",
      description: settings.is_published
        ? "Your public store is live and visible."
        : "Publish your storefront so customers can discover your products.",
      ready: settings.is_published,
      status: settings.is_published ? "Published" : "Not published",
      href: "/dashboard/online-store",
      icon: Globe2,
    },
    {
      label: "Coupon codes",
      description: settings.enable_coupons
        ? "Customers can enter coupon codes during online checkout."
        : "Turn on coupon codes before promoting discount campaigns online.",
      ready: settings.enable_coupons,
      status: settings.enable_coupons ? "Enabled" : "Disabled",
      href: "/dashboard/promotions",
      icon: TicketPercent,
    },
    {
      label: "Loyalty program",
      description: settings.loyalty_enabled
        ? "Customers can earn points from completed purchases."
        : "Enable loyalty points to support repeat-customer campaigns.",
      ready: settings.loyalty_enabled,
      status: settings.loyalty_enabled ? "Enabled" : "Disabled",
      href: "/dashboard/promotions",
      icon: Gift,
    },
    {
      label: "Customer audience",
      description:
        customers.length > 0
          ? `${customers.length.toLocaleString()} customer profiles are available for targeting.`
          : "Add customer profiles to build an audience for future campaigns.",
      ready: customers.length > 0,
      status: customers.length > 0 ? "Ready" : "No customers",
      href: "/dashboard/customers",
      icon: UsersRound,
    },
  ];

  return (
    <main className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span>Dashboard</span>
            <ChevronRight size={13} />
            <span className="text-slate-700">Marketing</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Marketing</h1>
          <p className="mt-1 text-sm text-slate-500">
            Grow {business.name} with offers, customer segments, loyalty and your online storefront.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/reports"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <BarChart3 size={16} />
            View reports
          </Link>
          <Link
            href="/dashboard/promotions"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Megaphone size={16} />
            Create campaign
          </Link>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <NavPill href="/dashboard/marketing" label="Overview" active />
        <NavPill href="/dashboard/promotions" label="Promotions & Loyalty" />
        <NavPill href="/dashboard/customers" label="Audience" />
        <NavPill href="/dashboard/online-store" label="Online Store" />
        <NavPill href="/dashboard/reports" label="Reports" />
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          icon={BadgePercent}
          iconClass="bg-blue-50 text-blue-600"
          label="Active campaigns"
          value={activeCoupons.length.toLocaleString()}
          helper={`${coupons.length.toLocaleString()} total offers`}
        />
        <MetricCard
          icon={UsersRound}
          iconClass="bg-violet-50 text-violet-600"
          label="Customer audience"
          value={customers.length.toLocaleString()}
          helper={`${newCustomers.toLocaleString()} new this month`}
        />
        <MetricCard
          icon={Repeat2}
          iconClass="bg-amber-50 text-amber-600"
          label="Repeat customers"
          value={repeatCustomers.toLocaleString()}
          helper={`${activeCustomers.toLocaleString()} active in 30 days`}
        />
        <MetricCard
          icon={BadgePercent}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Discount given this month"
          value={formatMoney(discountGiven, settings.currency)}
          helper={`${onlineOrdersThisMonth.toLocaleString()} completed online orders`}
        />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,0.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <SectionIcon className="bg-blue-50 text-blue-600">
                <Megaphone size={18} />
              </SectionIcon>
              <div>
                <h2 className="font-semibold text-slate-950">Campaigns & offers</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Current coupon campaigns from Promotions & Loyalty.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/promotions"
              className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Manage campaigns <ArrowUpRight size={15} />
            </Link>
          </div>

          {coupons.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <TicketPercent size={23} />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">No campaigns yet</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Create a coupon campaign, then track its status and usage from this marketing overview.
              </p>
              <Link
                href="/dashboard/promotions"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <BadgePercent size={16} /> Create first offer
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Campaign</th>
                    <th className="px-4 py-3">Offer</th>
                    <th className="px-4 py-3">Usage</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coupons.slice(0, 8).map((coupon) => {
                    const status = getCouponStatus(coupon, now);
                    return (
                      <tr key={coupon.id} className="transition hover:bg-slate-50/70">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                              <TicketPercent size={17} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">
                                {coupon.name || coupon.code}
                              </p>
                              <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                                {coupon.code}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-800">
                          {formatCouponValue(coupon, settings.currency)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="min-w-[120px]">
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="font-medium text-slate-700">
                                {coupon.usage_count.toLocaleString()}
                                {coupon.usage_limit ? ` / ${coupon.usage_limit.toLocaleString()}` : ""}
                              </span>
                              <span className="text-slate-400">
                                {coupon.usage_limit
                                  ? `${Math.min(100, Math.round((coupon.usage_count / coupon.usage_limit) * 100))}%`
                                  : "Unlimited"}
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{
                                  width: coupon.usage_limit
                                    ? `${Math.min(100, (coupon.usage_count / coupon.usage_limit) * 100)}%`
                                    : coupon.usage_count > 0
                                      ? "16%"
                                      : "0%",
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs leading-5 text-slate-500">
                          {formatCouponPeriod(coupon)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusPill status={status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-start gap-3">
              <SectionIcon className="bg-violet-50 text-violet-600">
                <Zap size={18} />
              </SectionIcon>
              <div>
                <h2 className="font-semibold text-slate-950">Marketing setup</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Keep the main customer-growth tools ready.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 px-5">
            {setupItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group flex gap-3 py-4"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition group-hover:bg-blue-50 group-hover:text-blue-600">
                    <Icon size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{item.label}</p>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                          item.ready
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {item.ready ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <SectionIcon className="bg-emerald-50 text-emerald-600">
              <UsersRound size={18} />
            </SectionIcon>
            <div>
              <h2 className="font-semibold text-slate-950">Customer segments</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Useful audiences based on real customer and completed-order activity.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/customers"
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            View customers <ArrowUpRight size={15} />
          </Link>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <SegmentCard
            icon={UserRoundPlus}
            label="New customers"
            value={newCustomers}
            helper="Joined this month"
          />
          <SegmentCard
            icon={Repeat2}
            label="Repeat buyers"
            value={repeatCustomers}
            helper="2+ completed purchases"
          />
          <SegmentCard
            icon={Zap}
            label="Active customers"
            value={activeCustomers}
            helper="Purchased within 30 days"
          />
          <SegmentCard
            icon={CalendarRange}
            label="Re-engagement"
            value={lapsedCustomers}
            helper="Last purchase 60+ days ago"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <SectionIcon className="bg-blue-50 text-blue-600">
              <Store size={18} />
            </SectionIcon>
            <div>
              <h2 className="font-semibold text-slate-950">Quick marketing actions</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Jump directly to the tools that already exist in TENH POS.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ActionCard
              href="/dashboard/promotions"
              icon={BadgePercent}
              title="Create an offer"
              description="Coupons, loyalty and repeat-customer rewards."
            />
            <ActionCard
              href="/dashboard/customers"
              icon={UsersRound}
              title="Build your audience"
              description="Review customer activity and purchase history."
            />
            <ActionCard
              href="/dashboard/online-store"
              icon={ShoppingBag}
              title="Update storefront"
              description="Branding, ordering, checkout and public-store settings."
            />
            <ActionCard
              href="/dashboard/reports"
              icon={BarChart3}
              title="Measure results"
              description="Review sales, discounts and channel performance."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <SectionIcon className="bg-amber-50 text-amber-600">
              <Megaphone size={18} />
            </SectionIcon>
            <div>
              <h2 className="font-semibold text-slate-950">Campaign channels</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Keep existing sales tools active now; add outbound channels later without changing this workspace.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ChannelCard
              icon={Store}
              title="Online Store"
              status={settings.is_published ? "Live" : "Setup needed"}
              ready={settings.is_published}
              description="Storefront campaigns and coupon offers."
            />
            <ChannelCard
              icon={ShoppingBag}
              title="POS customers"
              status={customers.length > 0 ? "Ready" : "Build audience"}
              ready={customers.length > 0}
              description="Use purchase history to identify customer groups."
            />
            <ChannelCard
              icon={Megaphone}
              title="Email / SMS"
              status="Coming later"
              ready={false}
              description="Reserved for future outbound campaigns and automation."
              muted
            />
            <ChannelCard
              icon={Globe2}
              title="Social campaigns"
              status="Coming later"
              ready={false}
              description="Reserved for social publishing and campaign links."
              muted
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function NavPill({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {label}
    </Link>
  );
}

function MetricCard({
  icon: Icon,
  iconClass,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function SegmentCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
          <Icon size={17} />
        </div>
        <span className="text-2xl font-bold tracking-tight text-slate-950">{value.toLocaleString()}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-blue-200 hover:bg-blue-50/30"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <ChevronRight size={15} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </Link>
  );
}

function ChannelCard({
  icon: Icon,
  title,
  status,
  ready,
  description,
  muted = false,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  ready: boolean;
  description: string;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 p-3.5 ${muted ? "bg-slate-50/70" : "bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200">
          <Icon size={17} />
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
            ready
              ? "bg-emerald-50 text-emerald-700"
              : muted
                ? "bg-slate-100 text-slate-500"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {status}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function SectionIcon({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${className}`}>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: CouponStatus }) {
  const className =
    status === "Active"
      ? "bg-emerald-50 text-emerald-700"
      : status === "Scheduled"
        ? "bg-blue-50 text-blue-700"
        : status === "Paused"
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-500";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "Active"
            ? "bg-emerald-500"
            : status === "Scheduled"
              ? "bg-blue-500"
              : status === "Paused"
                ? "bg-amber-500"
                : "bg-slate-400"
        }`}
      />
      {status}
    </span>
  );
}

function getCouponStatus(coupon: CouponRow, now: Date): CouponStatus {
  const currentTime = now.getTime();
  if (!coupon.is_active) return "Paused";
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > currentTime) return "Scheduled";
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < currentTime) return "Expired";
  return "Active";
}

function formatCouponValue(coupon: CouponRow, currency: string) {
  if (coupon.discount_type === "percentage") {
    return `${Number(coupon.discount_value).toLocaleString(undefined, { maximumFractionDigits: 2 })}% off`;
  }
  return `${formatMoney(Number(coupon.discount_value), currency)} off`;
}

function formatCouponPeriod(coupon: CouponRow) {
  if (!coupon.starts_at && !coupon.ends_at) return "Ongoing";
  if (coupon.starts_at && coupon.ends_at) {
    return `${formatShortDate(coupon.starts_at)} → ${formatShortDate(coupon.ends_at)}`;
  }
  if (coupon.starts_at) return `Starts ${formatShortDate(coupon.starts_at)}`;
  return `Ends ${formatShortDate(coupon.ends_at!)}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "KHR" ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}
