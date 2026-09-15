import {
  BadgePercent,
  Gift,
  PauseCircle,
  PlayCircle,
  Plus,
  TicketPercent,
  Trash2,
} from "lucide-react";

import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

export default async function PromotionsPage() {
  const business = await requirePermission("storefront.view");

  const [settings, couponResult] = await Promise.all([
    getStorefrontSettings(business.id),
    supabaseAdmin
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
  ]);

  if (couponResult.error) {
    throw new Error(
      `Unable to load promotions: ${couponResult.error.message}`,
    );
  }

  const coupons = (couponResult.data ?? []) as Coupon[];
  const canEdit = business.role === "owner" || business.role === "admin";

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Promotions & Loyalty
        </h1>
        <p className="mt-1 text-slate-500">
          Run coupon campaigns and reward repeat customers from one place.
        </p>
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div>
              <div className="flex items-center gap-2">
                <TicketPercent size={20} className="text-blue-600" />
                <h2 className="text-xl font-semibold text-slate-900">
                  Coupon Campaigns
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Codes are verified again by the database during checkout.
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {coupons.length} total
            </span>
          </div>

          {coupons.length === 0 ? (
            <div className="p-12 text-center">
              <BadgePercent
                size={44}
                className="mx-auto text-slate-300"
              />
              <p className="mt-4 font-semibold text-slate-700">
                No coupons yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Create a percentage or fixed-value promotion.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {coupons.map((coupon) => (
                <div
                  key={coupon.id}
                  className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-sm font-bold text-white">
                        {coupon.code}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          coupon.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {coupon.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold text-slate-900">
                      {coupon.name || formatCouponValue(coupon, settings.currency)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatCouponValue(coupon, settings.currency)}
                      {Number(coupon.minimum_order) > 0
                        ? ` · Min ${formatMoney(Number(coupon.minimum_order), settings.currency)}`
                        : ""}
                      {coupon.usage_limit
                        ? ` · ${coupon.usage_count}/${coupon.usage_limit} uses`
                        : ` · ${coupon.usage_count} uses`}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatWindow(coupon.starts_at, coupon.ends_at)}
                      {coupon.per_customer_limit
                        ? ` · ${coupon.per_customer_limit} use(s) per customer`
                        : ""}
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex gap-2">
                      <form action={setCouponActive}>
                        <input type="hidden" name="couponId" value={coupon.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(!coupon.is_active)}
                        />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {coupon.is_active ? (
                            <PauseCircle size={17} />
                          ) : (
                            <PlayCircle size={17} />
                          )}
                          {coupon.is_active ? "Pause" : "Enable"}
                        </button>
                      </form>

                      <form action={deleteCoupon}>
                        <input type="hidden" name="couponId" value={coupon.id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-red-200 p-2 text-red-600 hover:bg-red-50"
                          title={
                            coupon.usage_count > 0
                              ? "Archive coupon"
                              : "Delete coupon"
                          }
                        >
                          <Trash2 size={18} />
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-50 p-3 text-violet-600">
                <Gift size={21} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Loyalty Program
                </h2>
                <p className="text-sm text-slate-500">
                  Points are awarded after an order is completed.
                </p>
              </div>
            </div>

            <form action={updateLoyaltySettings} className="mt-6 space-y-5">
              <Toggle
                name="enableCoupons"
                label="Enable coupon codes"
                description="Show the coupon box in online checkout."
                defaultChecked={settings.enable_coupons}
                disabled={!canEdit}
              />

              <Toggle
                name="loyaltyEnabled"
                label="Enable loyalty points"
                description="Completed POS and online orders can earn points when linked to a customer."
                defaultChecked={settings.loyalty_enabled}
                disabled={!canEdit}
              />

              <label className="block text-sm font-medium text-slate-700">
                Spend required for 1 point
                <input
                  name="spendPerPoint"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={Number(settings.loyalty_spend_per_point ?? 1)}
                  disabled={!canEdit}
                  className={inputClass}
                />
                <span className="mt-1 block text-xs text-slate-400">
                  Example: USD shop = 1.00. KHR shop could use 4000.
                </span>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Minimum order to earn points
                <input
                  name="loyaltyMinimumOrder"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={Number(settings.loyalty_minimum_order ?? 0)}
                  disabled={!canEdit}
                  className={inputClass}
                />
              </label>

              {canEdit && (
                <button
                  type="submit"
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
                >
                  Save Loyalty Settings
                </button>
              )}
            </form>
          </section>

          {canEdit && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Plus size={19} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Create Coupon
                </h2>
              </div>

              <form action={createCoupon} className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Code
                    <input
                      name="code"
                      required
                      minLength={3}
                      maxLength={30}
                      placeholder="WELCOME10"
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Campaign name
                    <input
                      name="name"
                      maxLength={120}
                      placeholder="New customer offer"
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Discount type
                    <select name="discountType" defaultValue="percentage" className={inputClass}>
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Discount value
                    <input
                      name="discountValue"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="10"
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Minimum order
                    <input
                      name="minimumOrder"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Max discount
                    <input
                      name="maxDiscount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Optional"
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Total usage limit
                    <input
                      name="usageLimit"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Unlimited"
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Per customer limit
                    <input
                      name="perCustomerLimit"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Unlimited"
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Starts
                    <input name="startsAt" type="datetime-local" className={inputClass} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Ends
                    <input name="endsAt" type="datetime-local" className={inputClass} />
                  </label>
                </div>

                <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Start this coupon as active
                </label>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                >
                  Create Coupon
                </button>
              </form>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";

function Toggle({
  name,
  label,
  description,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-slate-300"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-800">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function formatCouponValue(coupon: Coupon, currency: string) {
  const value = Number(coupon.discount_value);
  const base =
    coupon.discount_type === "percentage"
      ? `${value.toFixed(value % 1 ? 2 : 0)}% off`
      : `${formatMoney(value, currency)} off`;

  return coupon.max_discount && coupon.discount_type === "percentage"
    ? `${base} (max ${formatMoney(Number(coupon.max_discount), currency)})`
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

function formatWindow(start: string | null, end: string | null) {
  if (!start && !end) return "No date limit";
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  });
  if (start && end) {
    return `${formatter.format(new Date(start))} → ${formatter.format(new Date(end))}`;
  }
  if (start) return `Starts ${formatter.format(new Date(start))}`;
  return `Ends ${formatter.format(new Date(end!))}`;
}
