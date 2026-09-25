"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  Box,
  Check,
  Link2,
  Loader2,
  Store,
  UserRound,
} from "lucide-react";

import {
  businessModePresets,
  getBusinessModePreset,
  type BusinessModePreset,
} from "@/lib/business/business-mode-presets";
import type { ProductMode } from "@/lib/business/types";
import CreditBadges from "./credit-badges";
import { normalizeTenantSlug } from "@/lib/tenancy/domain";

import {
  checkStoreAddressAvailability,
  submitBusinessDetails,
  type StoreAddressAvailabilityResult,
} from "./actions";


const businessIllustrationByMode = {
  general: "/business-types/general-shop.svg",
  milk_tea: "/business-types/milk-tea.svg",
  shoes: "/business-types/shoes.svg",
  restaurant: "/business-types/restaurant.svg",
  cafe: "/business-types/cafe.svg",
  fashion: "/business-types/fashion.svg",
  grocery: "/business-types/grocery.svg",
  accessories: "/business-types/accessories.svg",
  beauty: "/business-types/beauty.svg",
  electronics: "/business-types/electronics.svg",
  other: "/business-types/other-business.svg",
} as const;


const businessModeOrder = new Map(
  [
    "general",
    "milk_tea",
    "shoes",
    "restaurant",
    "cafe",
    "fashion",
    "grocery",
    "accessories",
    "beauty",
    "electronics",
    "other",
  ].map((value, index) => [value, index]),
);

const orderedBusinessModePresets = [...businessModePresets].sort(
  (a, b) =>
    (businessModeOrder.get(a.value) ?? 999) -
    (businessModeOrder.get(b.value) ?? 999),
);

type Props = {
  businessName: string;
  currentBusinessType: string;
  currentProductMode: ProductMode;
  initialSlug: string;
  rootDomain: string;
  canEdit: boolean;
  subscriptionPlanKey: string;
  freeUrlChangesRemaining: number;
  freeBusinessModeChangesRemaining: number;
  urlCredits: number;
  modeCredits: number;
  pendingCheckout?: {id:string;status:string;total_amount:number|string}|null;
};

export default function BusinessSettingsClient({
  businessName,
  currentBusinessType,
  currentProductMode,
  initialSlug,
  rootDomain,
  canEdit,
  freeUrlChangesRemaining,
  freeBusinessModeChangesRemaining,
  urlCredits,
  modeCredits,
  pendingCheckout,
}: Props) {
  const confirmation=useRef<HTMLDialogElement>(null);
  const [result,submit]=useActionState(submitBusinessDetails,{error:""});
  const form=useRef<HTMLFormElement>(null);
  const confirmed=useRef(false);
  const [businessMode, setBusinessMode] = useState(currentBusinessType);
  const [slug, setSlug] = useState(initialSlug);
  const [availabilityResult, setAvailabilityResult] =
    useState<StoreAddressAvailabilityResult | null>(null);
  const [checkedSlug, setCheckedSlug] = useState("");
  const [checkingAvailability, startAvailabilityCheck] = useTransition();

  const selectedPreset = useMemo(
    () => getBusinessModePreset(businessMode),
    [businessMode],
  );

  const currentPreset = getBusinessModePreset(currentBusinessType);
  const normalizedPreviewSlug = normalizeTenantSlug(slug) || initialSlug;
  const storePreviewUrl = `${normalizedPreviewSlug}.${rootDomain}`;
  const businessModeChanged = businessMode !== currentBusinessType;
  const productEngineChanged =
    Boolean(selectedPreset) && selectedPreset?.productMode !== currentProductMode;
  const slugChanged = normalizedPreviewSlug !== initialSlug;
  const availabilityMatchesCurrentSlug =
    checkedSlug === normalizedPreviewSlug && availabilityResult !== null;
  const changedSlugIsAvailable =
    !slugChanged ||
    (availabilityMatchesCurrentSlug &&
      availabilityResult?.available === true &&
      availabilityResult.status === "available");
  const changeCount = Number(slugChanged) + Number(businessModeChanged);
  const availableUrlCredits = freeUrlChangesRemaining + urlCredits;
  const availableModeCredits = freeBusinessModeChangesRemaining + modeCredits;
  const hasRequiredCredits = (!slugChanged || availableUrlCredits > 0) &&
    (!businessModeChanged || availableModeCredits > 0);

  return (
    <main className="mx-auto w-full max-w-[1600px] pb-10">
      <Link
        href="/dashboard/settings/business"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
      >
        <ArrowLeft size={18} />
        Back to Business Details
      </Link>

      <header className="mb-6 flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
          Business Details
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-4xl dark:text-white">
          Change {businessName}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          Edit your TENH POS store address or switch the business setup that matches how you sell.
        </p>
        </div>
        <CreditBadges modeCredits={availableModeCredits} urlCredits={availableUrlCredits} canBuy={canEdit}/>
      </header>

      {pendingCheckout&&<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"><p className="text-sm font-semibold">{pendingCheckout.status==='pending_payment'?'You have an unfinished checkout.':'Your payment is awaiting review.'}</p><Link href={`/dashboard/settings/business/payment/${pendingCheckout.id}`} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">{pendingCheckout.status==='pending_payment'?'Continue checkout':'View payment'}</Link></div>}
      {result.error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{result.error}</p>}
      <form ref={form} action={submit} onSubmit={event=>{if(!hasRequiredCredits||changeCount===0||!changedSlugIsAvailable){event.preventDefault();confirmed.current=false;return;}if(!confirmed.current){event.preventDefault();confirmation.current?.showModal();}else confirmed.current=false;}}>
        <input type="hidden" name="businessMode" value={businessMode} />

        <div className="space-y-6">
          <div className="space-y-6">
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                  Store URL
                </p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                  Your TENH POS address
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Use 1 available Store URL credit to change your address. Additional credits are $5 each.
                </p>
              </div>

              <label
                htmlFor="subdomain"
                className="mb-2 mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-300"
              >
                Store address
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-300 bg-white transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:ring-blue-950/50">
                  <input
                    id="subdomain"
                    name="subdomain"
                    value={slug}
                    onChange={(event) => {
                      setSlug(
                        event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "-"),
                      );
                      setAvailabilityResult(null);
                      setCheckedSlug("");
                    }}
                    required
                    minLength={2}
                    maxLength={40}
                    disabled={!canEdit}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm font-semibold text-slate-950 outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:text-white dark:disabled:bg-slate-900"
                  />
                  <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    .{rootDomain}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={
                    !canEdit ||
                    checkingAvailability ||
                    normalizedPreviewSlug.length < 2 ||
                    !slugChanged
                  }
                  onClick={() => {
                    const candidate = normalizedPreviewSlug;
                    startAvailabilityCheck(async () => {
                      const result = await checkStoreAddressAvailability(slug);
                      setCheckedSlug(candidate);
                      setAvailabilityResult(result);
                    });
                  }}
                  className="inline-flex min-h-[50px] shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:min-w-[155px] dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50 dark:disabled:border-slate-800 dark:disabled:bg-slate-900 dark:disabled:text-slate-600"
                >
                  {checkingAvailability ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : availabilityMatchesCurrentSlug && availabilityResult?.available ? (
                    <Check size={17} />
                  ) : null}
                  {checkingAvailability
                    ? "Checking…"
                    : !slugChanged
                      ? "Current address"
                      : availabilityMatchesCurrentSlug && availabilityResult?.available
                        ? "Available"
                        : "Check availability"}
                </button>
              </div>

              {slugChanged && availabilityMatchesCurrentSlug && availabilityResult ? (
                <p
                  className={`mt-2 text-xs font-semibold ${
                    availabilityResult.available
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {availabilityResult.available ? "✓ " : ""}
                  {availabilityResult.message}
                </p>
              ) : slugChanged ? (
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Check this address before applying your changes.
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Link2 size={14} className="shrink-0 text-blue-600" />
                  <span className="break-all">{storePreviewUrl}</span>
                </div>
                {slugChanged ? (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    URL change · 1 credit required
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                    Current address
                  </span>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                  Business type
                </p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                  Switch to another business type?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Use 1 available Business mode credit to change your business setup. Additional credits are $5 each.
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {orderedBusinessModePresets.map((preset) => (
                  <BusinessModeCard
                    key={preset.value}
                    preset={preset}
                    selected={businessMode === preset.value}
                    current={currentBusinessType === preset.value}
                    disabled={!canEdit}
                    onSelect={() => setBusinessMode(preset.value)}
                  />
                ))}
              </div>

              <SetupSummaryBar preset={selectedPreset} storeUrl={storePreviewUrl} />

              {businessModeChanged && (
                <div
                  className={`mt-4 rounded-2xl border p-4 text-sm leading-6 ${
                    productEngineChanged
                      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"
                      : "border-blue-100 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200"
                  }`}
                >
                  <p className="font-bold">
                    Switching from {currentPreset?.label ?? "your current mode"} to {selectedPreset?.label ?? "this mode"}
                  </p>
                  <p className="mt-1">
                    {productEngineChanged
                      ? `The product engine changes from ${currentProductMode} to ${selectedPreset?.productMode}. Existing products and historical orders are kept; TENH does not convert or delete them automatically.`
                      : `Both modes use ${selectedPreset?.productHint.toLowerCase()}, so your existing product engine stays the same.`}
                  </p>
                </div>
              )}

              {!canEdit && (
                <OwnerOnlyNotice>
                  Only the business owner can request a store URL or business-mode change.
                </OwnerOnlyNotice>
              )}

              {canEdit && (
                <div className="mt-5">
                  <ApplyButton
                    disabled={
                      changeCount === 0 ||
                      normalizedPreviewSlug.length < 2 ||
                      !selectedPreset ||
                      !changedSlugIsAvailable ||
                      !hasRequiredCredits
                    }
                    count={changeCount}
                  />
                  {!hasRequiredCredits&&<p role="status" className="mt-3 text-center text-sm text-amber-700 dark:text-amber-300">Buy the required credits above, then apply your changes.</p>}
                  <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
                    Store URL: {availableUrlCredits} {availableUrlCredits === 1 ? "credit" : "credits"} available · Business mode: {availableModeCredits} {availableModeCredits === 1 ? "credit" : "credits"} available
                  </p>
                </div>
              )}
            </section>
          </div>

        </div>
      </form>
      <dialog ref={confirmation} aria-labelledby="business-confirm-title" className="fixed inset-0 m-auto w-[min(92vw,480px)] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <h2 id="business-confirm-title" className="text-xl font-bold">Confirm business changes?</h2>
        <div className="mt-4 space-y-2 text-sm">
          {slugChanged&&<p>Store URL: <strong className="break-all">{initialSlug} → {normalizedPreviewSlug}</strong></p>}
          {businessModeChanged&&<p>Business mode: <strong>{currentPreset?.label} → {selectedPreset?.label}</strong></p>}
          <p className="pt-2 text-slate-500">Apply these changes using {changeCount} {changeCount===1?'credit':'credits'}. Included credits are used first.</p>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={()=>confirmation.current?.close()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={!hasRequiredCredits} onClick={()=>{confirmation.current?.close();confirmed.current=true;form.current?.requestSubmit();}} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Apply</button></div>
      </dialog>
    </main>
  );
}

function ApplyButton({
  disabled,
  count,
}: {
  disabled: boolean;
  count: number;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {pending ? <Loader2 size={18} className="animate-spin" /> : null}
      {pending ? "Applying…" : "Apply"}
      {count > 0 ? (
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
          {count} {count === 1 ? "credit" : "credits"}
        </span>
      ) : null}
    </button>
  );
}

function BusinessModeCard({
  preset,
  selected,
  current,
  disabled,
  onSelect,
}: {
  preset: BusinessModePreset;
  selected: boolean;
  current: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const illustration = businessIllustrationByMode[preset.value];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`group relative flex min-h-[190px] flex-col items-center rounded-2xl border px-3.5 py-4 text-center transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-blue-500 bg-white shadow-[0_10px_30px_rgba(37,99,235,0.10)] ring-2 ring-blue-100 dark:bg-slate-950 dark:ring-blue-950"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md hover:shadow-slate-200/60 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-blue-700"
      }`}
    >
      {selected && (
        <span className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      {current && <span className="absolute left-3 top-3 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Current</span>}
      <div className="flex h-[78px] w-[78px] shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-gradient-to-br from-slate-50 to-blue-50 transition duration-200 group-hover:scale-[1.04] dark:from-slate-900 dark:to-blue-950/50">
        <Image
          src={illustration}
          alt=""
          width={78}
          height={78}
          aria-hidden="true"
          className="h-full w-full object-contain p-1"
        />
      </div>
      <p className="mt-3 text-[15px] font-extrabold leading-5 text-slate-950 dark:text-white">
        {preset.label}
      </p>
      <p className="mt-1.5 max-w-[185px] text-xs leading-[1.45] text-slate-500 dark:text-slate-400">
        {preset.description}
      </p>
    </button>
  );
}

function SetupSummaryBar({
  preset,
  storeUrl,
}: {
  preset: BusinessModePreset | null;
  storeUrl: string;
}) {
  const items = [
    { icon: Store, label: "Business type", value: preset?.label ?? "General Shop" },
    { icon: Box, label: "Product engine", value: preset?.productHint ?? "Standard products" },
    { icon: Link2, label: "Store URL", value: storeUrl },
    { icon: UserRound, label: "Owner access", value: "POS + inventory + online store" },
  ];

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-950/50">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
          Your requested setup
        </p>
        <span className="hidden text-xs text-slate-400 sm:block">Review before confirming</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`flex min-w-0 items-start gap-3 ${index > 0 ? "lg:border-l lg:border-slate-200 lg:pl-4 dark:lg:border-slate-700" : ""}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
                <p className="mt-1 break-words text-sm font-bold leading-5 text-slate-900 dark:text-white">
                  {item.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function OwnerOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
      {children}
    </p>
  );
}
