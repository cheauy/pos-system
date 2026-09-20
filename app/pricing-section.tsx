"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  calculateSubscriptionPrice,
  subscriptionPlans,
  subscriptionTerms,
  type SubscriptionPlanKey,
  type SubscriptionTermMonths,
} from "@/lib/subscriptions/plans";

const marketingPlanOrder: SubscriptionPlanKey[] = [
  "solo",
  "small_team",
  "growth",
  "custom",
];

function money(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

export default function PricingSection({
  createStoreUrl,
}: {
  createStoreUrl: string;
}) {
  const [selectedMonths, setSelectedMonths] =
    useState<SubscriptionTermMonths>(1);

  const selectedTerm = useMemo(
    () =>
      subscriptionTerms.find((term) => term.months === selectedMonths) ??
      subscriptionTerms[0],
    [selectedMonths],
  );

  return (
    <section
      id="pricing"
      className="border-y border-slate-200/80 bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-sm font-extrabold uppercase tracking-[0.18em] text-blue-600">
              Simple pricing
            </div>
            <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-5xl">
              Choose the plan that fits your team.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Start small and upgrade as your business grows. Every paid plan keeps your TENH POS admin workspace and public TENH storefront connected to the same business.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-6 text-slate-600">
            <div className="font-extrabold text-slate-900">
              Save on longer terms
            </div>
            <div className="mt-1">
              3 months: 5% off · 6 months: 8% off · 1 year: 10% off
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="inline-flex w-full max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm sm:w-auto">
            {subscriptionTerms.map((term) => {
              const active = term.months === selectedMonths;
              const label =
                term.months === 1
                  ? "Monthly"
                  : term.months === 12
                    ? "1 year"
                    : `${term.months} months`;

              return (
                <button
                  key={term.months}
                  type="button"
                  onClick={() => setSelectedMonths(term.months)}
                  className={`flex min-w-0 flex-1 flex-col items-center rounded-xl px-4 py-2.5 text-sm font-extrabold transition sm:min-w-[130px] ${
                    active
                      ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <span>{label}</span>
                  {term.discountPercent > 0 ? (
                    <span
                      className={`mt-0.5 text-[11px] font-bold ${
                        active ? "text-emerald-600" : "text-slate-400"
                      }`}
                    >
                      Save {term.discountPercent}%
                    </span>
                  ) : (
                    <span className="mt-0.5 text-[11px] font-bold text-slate-400">
                      Standard price
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          {marketingPlanOrder.map((planKey) => {
            const plan = subscriptionPlans[planKey];
            const featured = planKey === "growth";
            const isCustom = plan.monthlyPrice === null;
            const calculated = isCustom
              ? null
              : calculateSubscriptionPrice(
                  planKey as Exclude<SubscriptionPlanKey, "custom">,
                  selectedMonths,
                );
            const discountedMonthly = calculated
              ? calculated.total / selectedMonths
              : null;
            const hasDiscount =
              Boolean(calculated) && selectedTerm.discountPercent > 0;

            return (
              <div
                key={plan.key}
                className={`relative flex h-full flex-col rounded-[30px] border p-6 shadow-sm ${
                  featured
                    ? "border-blue-300 bg-gradient-to-b from-blue-50 to-white shadow-xl shadow-blue-100/70"
                    : "border-slate-200 bg-white"
                }`}
              >
                {plan.badge ? (
                  <div
                    className={`absolute right-5 top-5 rounded-full px-3 py-1 text-xs font-extrabold ${
                      featured
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {plan.badge}
                  </div>
                ) : null}

                <div className="pr-20">
                  <h3 className="text-xl font-black tracking-tight text-slate-950">
                    {plan.name}
                  </h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
                    {plan.description}
                  </p>
                </div>

                {isCustom ? (
                  <div className="mt-7">
                    <div className="text-4xl font-black tracking-[-0.04em] text-slate-950">
                      Custom
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-500">
                      $5/user + $20/branch per month
                    </p>
                  </div>
                ) : (
                  <div className="mt-7">
                    {hasDiscount ? (
                      <div className="mb-1 text-sm font-bold text-slate-400 line-through">
                        {money(plan.monthlyPrice ?? 0)} / month
                      </div>
                    ) : null}
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black tracking-[-0.04em] text-slate-950">
                        {money(discountedMonthly ?? plan.monthlyPrice ?? 0)}
                      </span>
                      <span className="pb-1 text-sm font-semibold text-slate-500">
                        / month
                      </span>
                    </div>
                    <div className="mt-2 min-h-10 text-sm leading-5 text-slate-500">
                      {selectedMonths === 1 ? (
                        "Billed monthly"
                      ) : (
                        <>
                          {money(calculated?.total ?? 0)} billed every {selectedTerm.label}
                          <span className="ml-1 font-bold text-emerald-600">
                            · Save {selectedTerm.discountPercent}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-6 space-y-3 border-t border-slate-100 pt-6 text-sm text-slate-600">
                  <PricingFeature>
                    {plan.userLimit === null
                      ? "Choose your user allowance"
                      : `${plan.userLimit} ${plan.userLimit === 1 ? "user" : "users"}`}
                  </PricingFeature>
                  <PricingFeature>
                    {plan.teamEnabled
                      ? "Team access included"
                      : "Built for one owner"}
                  </PricingFeature>
                  <PricingFeature>{isCustom ? "Choose your users and branches" : "1 branch included"}</PricingFeature>
                  <PricingFeature>POS + public online store</PricingFeature>
                  <PricingFeature>QR ordering and inventory</PricingFeature>
                  <PricingFeature>All 11 TENH business modes</PricingFeature>
                  {plan.freeUrlChangesPerMonth > 0 ? (
                    <PricingFeature>
                      {plan.freeUrlChangesPerMonth} free Store URL changes / month
                    </PricingFeature>
                  ) : null}
                  {plan.freeBusinessModeChangesPerMonth > 0 ? (
                    <PricingFeature>
                      {plan.freeBusinessModeChangesPerMonth} free business-mode changes / month
                    </PricingFeature>
                  ) : null}
                </div>

                <Link
                  href={createStoreUrl}
                  className={`mt-7 inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-extrabold transition hover:-translate-y-0.5 ${
                    featured
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
                      : "border border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:text-blue-700"
                  }`}
                >
                  Create store
                  <ArrowRight size={17} />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50/80 p-6 text-center">
          <p className="text-sm leading-6 text-slate-600">
            Prices above update per selected term. The discounted price is shown per month, while the total is billed for the full selected subscription term.
          </p>
        </div>
      </div>
    </section>
  );
}

function PricingFeature({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check size={13} strokeWidth={3} />
      </div>
      <span>{children}</span>
    </div>
  );
}
