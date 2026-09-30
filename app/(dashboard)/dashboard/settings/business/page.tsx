import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Link2,
  Pencil,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";

import BusinessInfoForm from "./business-info-form";
import OnlinePaymentForm from "./online-payment-form";
import BusinessSettingsClient from "./business-settings-client";
import CreditBadges from "./credit-badges";
import PendingCheckoutNotice from "./pending-checkout-notice";
import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import { getBusinessChangeEntitlements } from "@/lib/subscriptions/entitlements";
import { isSubscriptionPaymentExpired } from "@/lib/subscriptions/payment-expiry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRootDomain, getSubdomainUrl } from "@/lib/tenancy/domain";

function inferBusinessType(productMode: string) {
  if (productMode === "variant") return "fashion";
  if (productMode === "configurable") return "milk_tea";
  return "general";
}

function formatUpdatedAt(value: string, timezone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || "Asia/Phnom_Penh",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Phnom_Penh",
    }).format(date);
  }
}

export default async function BusinessSettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const query = await searchParams;
  const business = await requirePermission("business.view");

  const { data: storefront } = await supabaseAdmin
    .from("business_storefronts")
    .select("business_type")
    .eq("business_id", business.id)
    .maybeSingle();

  const entitlements = await getBusinessChangeEntitlements(business.id);
  const { data: checkoutRows, error: checkoutError } = await supabaseAdmin
    .from("business_change_orders")
    .select("id,status,total_amount,payment_expires_at,payment_expired_at,created_at")
    .eq("business_id", business.id)
    .in("status", ["pending_payment", "payment_submitted", "under_review"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (checkoutError) throw new Error("Unable to load business checkout.");
  const pendingCheckout =
    checkoutRows?.find(
      order =>
        order.status !== "pending_payment" ||
        (!order.payment_expired_at && !isSubscriptionPaymentExpired(order)),
    ) ?? null;

  const storedBusinessType = storefront?.business_type ?? "";
  const currentBusinessType =
    getBusinessModePreset(storedBusinessType)?.value ?? inferBusinessType(business.productMode);

  if (query.edit !== "1") {
    const [sharedSettings, canEditInfo, canEditPayment] = await Promise.all([
      getStorefrontSettings(business.id),
      businessHasPermission(business, "business.update"),
      businessHasPermission(business, "storefront.update"),
    ]);
    const preset = getBusinessModePreset(currentBusinessType);
    const [userResult, branchResult, leadersResult] = await Promise.all([
      supabaseAdmin
        .from("business_members")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("is_active", true),
      supabaseAdmin
        .from("business_locations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("is_active", true),
      supabaseAdmin
        .from("business_members")
        .select("user_id,role")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .in("role", ["owner", "admin"]),
    ]);
    if (userResult.error || branchResult.error || leadersResult.error) {
      throw new Error("Unable to load business members and branches. Please try again.");
    }

    const leaders = leadersResult.data ?? [];
    const { data: profiles, error: profilesError } = leaders.length
      ? await supabaseAdmin.from("profiles").select("id,full_name").in(
          "id",
          leaders.map(member => member.user_id),
        )
      : { data: [], error: null };
    if (profilesError) throw new Error("Unable to load business owner details. Please try again.");

    const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name]));
    const leadership = [...leaders].sort(
      (a, b) => Number(b.role === "owner") - Number(a.role === "owner"),
    );
    const primaryLeader = leadership[0];
    const primaryLeaderName = primaryLeader
      ? names.get(primaryLeader.user_id)?.trim() || "Name not set"
      : "Not assigned";
    const storeUrl = getSubdomainUrl(business.slug);
    const timezone = sharedSettings.social_links?.profile?.openingHours?.timezone;

    return (
      <main className="mx-auto w-full max-w-[1600px] space-y-4 pb-10">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
              Business Settings
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage your store details, business information, store hours and more.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <p className="text-xs font-medium text-slate-400">
              Last updated&nbsp; • &nbsp;
              <time dateTime={sharedSettings.updated_at}>
                {formatUpdatedAt(sharedSettings.updated_at, timezone)}
              </time>
            </p>
            <span id="business-info-save-slot" className="contents" />
          </div>
        </header>

        <section className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-slate-100 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          {sharedSettings.banner_url ? (
            <img
              src={sharedSettings.banner_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-y-0 right-0 hidden h-full w-[48%] object-cover opacity-90 lg:block"
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-50 via-white/95 to-white/10 dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-900/10" />
          <div className="relative grid min-h-[230px] gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-8">
            <div className="max-w-3xl">
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-white text-blue-600 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  {sharedSettings.logo_url ? (
                    <img src={sharedSettings.logo_url} alt={`${business.name} logo`} className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <Store size={28} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-2xl font-extrabold text-slate-950 dark:text-white">
                      {business.name}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <CheckCircle2 size={13} /> Active
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">
                    {preset?.label ?? currentBusinessType}
                  </p>
                  {sharedSettings.description ? (
                    <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {sharedSettings.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/80 bg-white/80 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
                  <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Link2 size={14} className="text-blue-600" /> Store URL
                  </p>
                  <a href={storeUrl} target="_blank" rel="noreferrer" className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-bold text-slate-900 hover:text-blue-600 dark:text-white">
                    <span className="truncate">{business.slug}.{getRootDomain()}</span>
                    <ExternalLink size={13} className="shrink-0" />
                  </a>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/80 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
                  <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Store size={14} className="text-blue-600" /> Business mode
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {preset?.label ?? currentBusinessType}
                  </p>
                </div>
              </div>
            </div>

            {business.role === "owner" ? (
              <Link
                href="/dashboard/settings/business?edit=1"
                className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <Pencil size={16} /> Change settings
              </Link>
            ) : null}
          </div>
        </section>

        <CreditBadges
          modeCredits={entitlements.modeFreeRemaining + entitlements.modeCredits}
          urlCredits={entitlements.urlFreeRemaining + entitlements.urlCredits}
          canBuy={business.role === "owner"}
        />

        <section className="grid gap-3 md:grid-cols-3" aria-label="Business access summary">
          <MetricCard
            icon={<ShieldCheck size={19} />}
            label="Owner / Admin"
            value={primaryLeaderName}
            helper={primaryLeader?.role === "owner" ? "Full access to manage your business." : "Business administrator"}
          />
          <MetricCard
            icon={<Users size={19} />}
            label="Users"
            value={String(userResult.count ?? 0)}
            helper="Active users, including the owner."
          />
          <MetricCard
            icon={<Building2 size={19} />}
            label="Branches"
            value={String(branchResult.count ?? 0)}
            helper="Active branches across your business."
          />
        </section>

        {pendingCheckout ? <PendingCheckoutNotice key={pendingCheckout.id} order={pendingCheckout} /> : null}

        <BusinessInfoForm
          key={business.id}
          businessId={business.id}
          businessName={business.name}
          canEditBusinessName={business.role === "owner"}
          canEdit={canEditInfo}
          logoUrl={sharedSettings.logo_url}
          bannerUrl={sharedSettings.banner_url}
          description={sharedSettings.description}
          phone={sharedSettings.phone}
          address={sharedSettings.address}
          profile={sharedSettings.social_links?.profile}
        />

        <OnlinePaymentForm
          key={`${business.id}-payment`}
          settings={sharedSettings}
          canEdit={canEditPayment}
        />
      </main>
    );
  }

  return (
    <BusinessSettingsClient
      businessName={business.name}
      currentBusinessType={currentBusinessType}
      currentProductMode={business.productMode}
      initialSlug={business.slug}
      rootDomain={getRootDomain()}
      canEdit={business.role === "owner"}
      subscriptionPlanKey={entitlements.planKey}
      freeUrlChangesRemaining={entitlements.urlFreeRemaining}
      freeBusinessModeChangesRemaining={entitlements.modeFreeRemaining}
      urlCredits={entitlements.urlCredits}
      modeCredits={entitlements.modeCredits}
      pendingCheckout={pendingCheckout}
    />
  );
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 truncate text-lg font-extrabold text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{helper}</p>
        </div>
      </div>
    </div>
  );
}
