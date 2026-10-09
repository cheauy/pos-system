import Link from "next/link";
import QRCode from "qrcode";
import {
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Globe2,
  Link2,
  Pencil,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  Users,
} from "lucide-react";

import BusinessInfoForm from "./business-info-form";
import OnlinePaymentForm from "./online-payment-form";
import BusinessSettingsClient from "./business-settings-client";
import CreditBadges from "./credit-badges";
import PendingCheckoutNotice from "./pending-checkout-notice";
import BrandingPreview from "./branding-preview";
import SettingsSections from "./settings-sections";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./sections";
import CatalogPanel from "../../online-store/catalog-panel";
import CopyStoreUrlButton from "../../online-store/copy-store-url-button";
import QrSection from "../../online-store/qr-section";
import StorefrontSettingsForm from "../../online-store/storefront-settings-form";
import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { requireAnyPermission } from "@/lib/auth/require-permission";
import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import type { CurrentBusiness } from "@/lib/business/types";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import { supportsDineIn } from "@/lib/storefront/profile";
import { getBusinessChangeEntitlements } from "@/lib/subscriptions/entitlements";
import { isSubscriptionPaymentExpired } from "@/lib/subscriptions/payment-expiry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRootDomain, getSubdomainUrl, isLocalRootDomain } from "@/lib/tenancy/domain";

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

async function loadBusinessChanges(businessId: string) {
  const [entitlements, { data: checkoutRows, error: checkoutError }] = await Promise.all([
    getBusinessChangeEntitlements(businessId),
    supabaseAdmin
      .from("business_change_orders")
      .select("id,status,total_amount,payment_expires_at,payment_expired_at,created_at")
      .eq("business_id", businessId)
      .in("status", ["pending_payment", "payment_submitted", "under_review"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (checkoutError) throw new Error("Unable to load business checkout.");
  const pendingCheckout =
    checkoutRows?.find(
      order =>
        order.status !== "pending_payment" ||
        (!order.payment_expired_at && !isSubscriptionPaymentExpired(order)),
    ) ?? null;
  return { entitlements, pendingCheckout };
}

async function loadLeadership(business: CurrentBusiness) {
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
  const primaryLeader = [...leaders].sort(
    (a, b) => Number(b.role === "owner") - Number(a.role === "owner"),
  )[0];
  return {
    users: userResult.count ?? 0,
    branches: branchResult.count ?? 0,
    primaryLeader,
    primaryLeaderName: primaryLeader
      ? names.get(primaryLeader.user_id)?.trim() || "Name not set"
      : "Not assigned",
  };
}

export default async function BusinessSettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const query = await searchParams;
  // Business Settings now also hosts the former Online Store Settings, so either view permission opens it;
  // each section below keeps the permission it had on its original page.
  const business = await requireAnyPermission(["business.view", "storefront.view"]);
  const [canViewBusiness, canViewStorefront] = await Promise.all([
    businessHasPermission(business, "business.view"),
    businessHasPermission(business, "storefront.view"),
  ]);

  if (query.edit === "1" && canViewBusiness) {
    const [{ data: storefront }, { entitlements, pendingCheckout }] = await Promise.all([
      supabaseAdmin
        .from("business_storefronts")
        .select("business_type")
        .eq("business_id", business.id)
        .maybeSingle(),
      loadBusinessChanges(business.id),
    ]);
    const currentBusinessType =
      getBusinessModePreset(storefront?.business_type ?? "")?.value ?? inferBusinessType(business.productMode);
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

  const storeUrl = getSubdomainUrl(business.slug);
  // localhost links and QR codes cannot reach customers.
  const localPreview = isLocalRootDomain();
  const [sharedSettings, canEditInfo, canEditStorefront, changes, leadership, storeQrImage] = await Promise.all([
    getStorefrontSettings(business.id),
    businessHasPermission(business, "business.update"),
    businessHasPermission(business, "storefront.update"),
    canViewBusiness ? loadBusinessChanges(business.id) : null,
    canViewBusiness ? loadLeadership(business) : null,
    canViewStorefront ? QRCode.toDataURL(storeUrl, { width: 400, margin: 4 }) : null,
  ]);
  const showTables = canViewStorefront && supportsDineIn(sharedSettings.business_type);
  const tablesResult = showTables
    ? await supabaseAdmin
        .from("business_tables")
        .select("id, name, public_token, is_active")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name")
    : { data: [], error: null };
  if (tablesResult.error) throw new Error("Unable to load store tables. Please try again.");

  const currentBusinessType =
    getBusinessModePreset(sharedSettings.business_type ?? "")?.value ?? inferBusinessType(business.productMode);
  const preset = getBusinessModePreset(currentBusinessType);
  const profile = sharedSettings.social_links?.profile;
  const timezone = profile?.openingHours?.timezone;
  const available = SETTINGS_SECTIONS.map(section => section.id).filter(id =>
    // Storefront also holds the payment form (business.view), so either view permission opens it.
    id === "overview" || id === "branding" || id === "storefront" ? true
      : id === "business-info" || id === "store-hours" ? canViewBusiness
        : canViewStorefront,
  );

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Business Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your business details, online store, store hours and more.
          </p>
        </div>
        <p className="text-xs font-medium text-slate-400">
          Last updated&nbsp; • &nbsp;
          <time dateTime={sharedSettings.updated_at}>
            {formatUpdatedAt(sharedSettings.updated_at, timezone)}
          </time>
        </p>
      </header>

      <SettingsSections available={available}>
        <div data-section="overview" className="space-y-6">
          {changes?.pendingCheckout ? <PendingCheckoutNotice key={changes.pendingCheckout.id} order={changes.pendingCheckout} /> : null}

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
                      <img src={sharedSettings.logo_url} alt={`${business.name} logo`} className="h-full w-full object-contain p-1.5"  data-i18n-template-alt="{0} logo" data-i18n-values-alt={JSON.stringify([business.name])}/>
                    ) : (
                      <Store size={28} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words text-2xl font-extrabold text-slate-950 dark:text-white" data-i18n-ignore="true">
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
                      <span className="truncate"><span data-i18n-ignore="true">{business.slug}</span>.{getRootDomain()}</span>
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

              {business.role === "owner" && canViewBusiness ? (
                <Link
                  href="/dashboard/settings/business?edit=1"
                  className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <Pencil size={16} /> Change settings
                </Link>
              ) : null}
            </div>
          </section>

          {canViewStorefront ? (
            <section aria-labelledby="store-status-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
              <h2 id="store-status-title" className={`text-base font-extrabold ${navy}`}>Store status</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
                <StatusToggle label="Public storefront" helper={sharedSettings.is_published ? "Customers can see your store" : "Hidden from customers"} slotId="storefront-publish-slot" />
                <StatusToggle label="Accept online orders" helper={sharedSettings.accept_online_orders ? "Checkout is open" : "Store stays visible; checkout is paused"} slotId="storefront-orders-slot" />
                <div className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500">Store URL</p>
                  {localPreview ? (
                    <p role="note" className="mt-1 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-4 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Local preview: <span className="break-all font-semibold">{storeUrl.replace(/^https?:\/\//, "")}</span> only works on this computer. Customers get the public link once the app runs on its real domain.
                    </p>
                  ) : (
                    <p className="mt-1 break-all text-sm font-bold text-blue-600">{storeUrl.replace(/^https?:\/\//, "")}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CopyStoreUrlButton value={storeUrl} />
                    <a href={storeUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                      Open Public Store <ExternalLink size={13} aria-hidden="true" />
                    </a>
                    <a href="?section=storefront" data-section-link="storefront" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                      <QrCode size={13} aria-hidden="true" /> QR codes
                    </a>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Columns follow the panel width: 2 on phones and narrow panels, 4 once each card keeps its label on one line. */}
          <section aria-label="Status summary" className="@container">
            <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
            {canViewStorefront ? <>
              <StatusCard section="storefront" label="Storefront" icon={<Globe2 size={18} />} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" value={sharedSettings.is_published ? "Public" : "Private"} on={sharedSettings.is_published} />
              <StatusCard section="storefront" label="Online Orders" icon={<ShoppingBag size={18} />} tone="bg-rose-50 text-rose-500 dark:bg-rose-950/50 dark:text-rose-300" value={sharedSettings.accept_online_orders ? "Accepting" : "Paused"} on={sharedSettings.accept_online_orders} />
              <StatusCard section="storefront" label="Pickup & Delivery" icon={<Truck size={18} />} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300" value={[sharedSettings.allow_pickup && "Pickup", sharedSettings.allow_delivery && "Delivery", showTables && sharedSettings.allow_dine_in && "Dine-in"].filter(Boolean).join(" · ") || "None enabled"} on={sharedSettings.allow_pickup || sharedSettings.allow_delivery} />
            </> : null}
            {canViewBusiness ? <StatusCard section="store-hours" label="Store Hours" icon={<Clock3 size={18} />} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" value={profile?.openingHours?.enabled ? "Shown on storefront" : "Hidden"} on={Boolean(profile?.openingHours?.enabled)} /> : null}
            </div>
          </section>

          {changes ? (
            <section aria-labelledby="credits-usage-title" className="space-y-3">
              <h2 id="credits-usage-title" className={`text-base font-extrabold ${navy}`}>Credits &amp; Usage</h2>
              <CreditBadges
                modeCredits={changes.entitlements.modeFreeRemaining + changes.entitlements.modeCredits}
                urlCredits={changes.entitlements.urlFreeRemaining + changes.entitlements.urlCredits}
                canBuy={business.role === "owner"}
              />
            </section>
          ) : null}

          {leadership ? (
            <section aria-labelledby="team-access-title" className="space-y-3">
              <h2 id="team-access-title" className={`text-base font-extrabold ${navy}`}>Team &amp; Access</h2>
              <div className="grid gap-3 md:grid-cols-3" aria-label="Business access summary">
                <MetricCard
                  icon={<ShieldCheck size={19} />}
                  label="Owner / Admin"
                  value={leadership.primaryLeaderName}
                  helper={leadership.primaryLeader?.role === "owner" ? "Full access to manage your business." : "Business administrator"}
                />
                <MetricCard
                  icon={<Users size={19} />}
                  label="Users"
                  value={String(leadership.users)}
                  helper="Active users, including the owner."
                />
                <MetricCard
                  icon={<Building2 size={19} />}
                  label="Branches"
                  value={String(leadership.branches)}
                  helper="Active branches across your business."
                />
              </div>
            </section>
          ) : null}
        </div>

        {canViewStorefront ? <>
          <div data-section="storefront" className="space-y-3">
            <p className="text-xs text-slate-500">
              One online store for all active branches. Orders are assigned automatically to a branch with available stock.
            </p>
          </div>
          <div data-section="product" className="min-w-0">
            <CatalogPanel currency={sharedSettings.currency} canEdit={canEditStorefront} />
          </div>
        </> : null}

        <div data-section="branding">
          <BrandingPreview
            name={sharedSettings.display_name?.trim() || business.name}
            initial={{
              logo: sharedSettings.logo_url,
              banner: sharedSettings.banner_url,
              description: sharedSettings.description ?? "",
              color: /^#[0-9a-f]{6}$/i.test(sharedSettings.primary_color ?? "") ? sharedSettings.primary_color : "#2563EB",
              currency: sharedSettings.currency || "USD",
              language: profile?.defaultLanguage === "km" ? "km" : "en",
              style: profile?.storefrontStyle === "simple" ? "simple" : "classic",
            }}
          />
        </div>

        {canViewBusiness ? (
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
            profile={profile}
          />
        ) : null}

        {canViewStorefront ? (
          <StorefrontSettingsForm
            key={`${business.id}-storefront`}
            settings={sharedSettings}
            storeUrl={storeUrl}
            businessName={business.name}
            canEdit={canEditStorefront}
          >
            <div data-section="storefront" className="min-w-0 space-y-3">
              {localPreview ? <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Local preview: these QR codes point to {storeUrl.replace(/^https?:\/\//, "")}, which only opens on this computer. Print them from the live app for customers.</p> : null}
              <QrSection
                storeUrl={storeUrl}
                storeQrImage={storeQrImage ?? ""}
                tables={tablesResult.data ?? []}
                allowDineIn={sharedSettings.allow_dine_in}
                canEdit={canEditStorefront}
                showTables={showTables}
              />
            </div>
          </StorefrontSettingsForm>
        ) : null}

        {canViewBusiness ? (
          <div data-section="storefront">
            <OnlinePaymentForm
              key={`${business.id}-payment`}
              settings={sharedSettings}
              canEdit={canEditStorefront}
            />
          </div>
        ) : null}

        {/* Shared sticky bar: each form portals its own Save button here, visible from every section. */}
        <div className="settings-save-bar">
          <span id="business-info-save-slot" className="contents" />
          <span id="storefront-save-slot" className="contents" />
        </div>
      </SettingsSections>
    </main>
  );
}

const navy = "text-[#14213d] dark:text-white";

// The switch itself is portaled in by StorefrontSettingsForm (its canonical editor) and saved with "Save storefront".
function StatusToggle({ label, helper, slotId }: { label: string; helper: string; slotId: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="min-w-0">
        <p className={`text-sm font-bold ${navy}`}>{label}</p>
        <p className="mt-0.5 break-words text-xs leading-4 text-slate-500">{helper}</p>
      </div>
      <span id={slotId} className="shrink-0" />
    </div>
  );
}

function StatusCard({ section, label, value, on, icon, tone }: { section: SettingsSectionId; label: string; value: string; on: boolean; icon: React.ReactNode; tone: string }) {
  return (
    // Narrow summaries (phones) stack the icon above the text so labels get the full card width; from 28rem of summary width the original row layout applies.
    <a href={`?section=${section}`} data-section-link={section} className="flex min-w-0 flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 focus-visible:outline-2 focus-visible:outline-blue-600 @md:flex-row @md:items-center @md:gap-3 @md:p-4 dark:border-slate-700 dark:bg-slate-900">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`} aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-500">{label}</span>
        <span className={`mt-0.5 flex items-center gap-2 text-sm font-bold ${navy}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
          <span className="min-w-0 break-words">{value}</span>
        </span>
      </span>
    </a>
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
          <p className="mt-1 break-words text-lg font-extrabold text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{helper}</p>
        </div>
      </div>
    </div>
  );
}
