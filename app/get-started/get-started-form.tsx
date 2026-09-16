"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Box,
  Check,
  Coffee,
  Gem,
  Laptop,
  Link2,
  Loader2,
  LogOut,
  Package,
  Shirt,
  ShoppingBasket,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  UserRound,
  UsersRound,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import {
  businessModePresets,
  getBusinessModePreset,
  type BusinessModePreset,
} from "@/lib/business/business-mode-presets";
import { createClient } from "@/lib/supabase/client";
import {
  getRootUrl,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

import { createOwnerBusiness } from "./actions";
import { initialGetStartedState } from "./state";

const iconByMode = {
  shoes: ShoppingBag,
  milk_tea: Coffee,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  fashion: Shirt,
  accessories: Gem,
  beauty: Sparkles,
  electronics: Laptop,
  grocery: ShoppingBasket,
  general: Store,
  other: Package,
} as const;

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

export default function GetStartedForm({ accountEmail }: { accountEmail: string }) {
  const [state, formAction, pending] = useActionState(
    createOwnerBusiness,
    initialGetStartedState,
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [businessMode, setBusinessMode] = useState("shoes");
  const [isUnsure, setIsUnsure] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [previewHost, setPreviewHost] = useState("tenh-pos.com");
  const [signingOut, setSigningOut] = useState(false);

  const selectedPreset = useMemo(
    () => getBusinessModePreset(businessMode),
    [businessMode],
  );

  const storePreviewUrl = `${subdomain || "your-shop"}.${previewHost}`;

  useEffect(() => {
    const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "tenh-pos.com")
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    if (window.location.hostname === "localhost" || window.location.hostname.endsWith(".localhost")) {
      setPreviewHost(`localhost:${window.location.port || "3000"}`);
      return;
    }

    setPreviewHost(rootDomain);
  }, []);

  useEffect(() => {
    if (!state.success || !state.destination) {
      return;
    }

    window.location.assign(state.destination);
  }, [state.success, state.destination]);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("[get-started] sign out failed:", error.message);
      }
    } finally {
      window.location.assign(getRootUrl("/login"));
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8fc] px-3 py-4 sm:px-5 sm:py-6 lg:px-7">
      <div className="mx-auto max-w-[1480px] rounded-[30px] border border-slate-200/80 bg-white p-4 shadow-[0_20px_70px_rgba(15,23,42,0.08)] sm:p-6 lg:p-7">
        <header className="flex items-center justify-between gap-4 px-1">
          <Link href="/" className="flex min-w-0 items-center gap-3 text-slate-950">
            <Image
              src="/tenh-pos-logo.png"
              alt="Tenh POS logo"
              width={44}
              height={44}
              priority
              className="h-11 w-11 shrink-0 rounded-2xl object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold tracking-tight sm:text-base">
                Tenh POS
              </p>
              <p className="truncate text-[11px] text-slate-500">
                Build. Sell. Grow.
              </p>
            </div>
          </Link>

          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="min-w-0 text-right">
              <p className="text-[11px] font-medium text-slate-400">Signed in</p>
              <p className="max-w-[150px] truncate text-xs font-semibold text-slate-700 sm:max-w-[220px] sm:text-sm">
                {accountEmail || "Tenh POS account"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5 sm:text-sm"
              aria-label="Sign out"
            >
              {signingOut ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <LogOut size={15} />
              )}
              <span className="hidden sm:inline">{signingOut ? "Signing out..." : "Sign out"}</span>
            </button>
          </div>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <section className="min-w-0 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:p-8">
            <SetupStepper step={step} />

            {step === 1 ? (
              <div className="mt-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
                  Get started
                </p>
                <h1 className="mt-2 max-w-3xl text-3xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                  What kind of business do you run?
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                  Choose the business type. TENH will automatically prepare the right POS and product setup for you.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {orderedBusinessModePresets.map((preset) => (
                    <BusinessModeCard
                      key={preset.value}
                      preset={preset}
                      selected={businessMode === preset.value && !isUnsure}
                      onSelect={() => {
                        setIsUnsure(false);
                        setBusinessMode(preset.value);
                      }}
                    />
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setIsUnsure(true);
                      setBusinessMode("other");
                    }}
                    className={`group relative flex min-h-[190px] flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center transition duration-200 ${
                      isUnsure
                        ? "border-blue-500 bg-blue-50/70 shadow-[0_8px_28px_rgba(37,99,235,0.08)] ring-2 ring-blue-100"
                        : "border-blue-200 bg-white hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md hover:shadow-blue-100/60"
                    }`}
                  >
                    {isUnsure && (
                      <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                    <div className="flex h-[74px] w-[74px] items-center justify-center rounded-[22px] bg-blue-50 text-3xl font-light text-blue-600 transition group-hover:scale-105">
                      +
                    </div>
                    <p className="mt-3 text-[15px] font-extrabold leading-5 text-slate-950">Not sure yet?</p>
                    <p className="mt-1.5 max-w-[160px] text-xs leading-[1.45] text-slate-500">
                      You can change this later in settings.
                    </p>
                  </button>
                </div>

                <SetupSummaryBar
                  preset={selectedPreset}
                  storeUrl={storePreviewUrl}
                />

                <button
                  type="button"
                  disabled={!businessMode}
                  onClick={() => setStep(2)}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                  <ArrowRight size={18} />
                </button>
                <p className="mt-3 text-center text-xs text-slate-400">
                  You can always change your business type later.
                </p>
              </div>
            ) : (
              <StoreDetailsForm
                formAction={formAction}
                pending={pending}
                state={state}
                businessMode={businessMode}
                businessName={businessName}
                setBusinessName={setBusinessName}
                subdomain={subdomain}
                setSubdomain={setSubdomain}
                subdomainTouched={subdomainTouched}
                setSubdomainTouched={setSubdomainTouched}
                selectedPreset={selectedPreset}
                onBack={() => setStep(1)}
              />
            )}
          </section>

          <SetupPreviewPanel preset={selectedPreset} />
        </div>
      </div>
    </main>
  );
}

function SetupStepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center text-xs font-semibold text-slate-500 sm:text-sm">
      <StepMarker number="1" label="Business type" active={step === 1} complete={step > 1} />
      <div className="mx-2 h-px min-w-4 flex-1 bg-slate-200 sm:mx-4">
        <div className="h-full w-1/3 bg-blue-600" />
      </div>
      <StepMarker number="2" label="Store details" active={step === 2} complete={false} />
      <div className="mx-2 h-px min-w-4 flex-1 bg-slate-200 sm:mx-4" />
      <StepMarker number="3" label="Finish" active={false} complete={false} />
    </div>
  );
}

function StepMarker({
  number,
  label,
  active,
  complete,
}: {
  number: string;
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition ${
          active
            ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20"
            : complete
              ? "border-blue-100 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-slate-50 text-slate-500"
        }`}
      >
        {complete ? <Check size={15} strokeWidth={3} /> : number}
      </span>
      <span className={`${active ? "text-slate-900" : "text-slate-500"} hidden font-semibold sm:block`}>
        {label}
      </span>
    </div>
  );
}

function BusinessModeCard({
  preset,
  selected,
  onSelect,
}: {
  preset: BusinessModePreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const illustration = businessIllustrationByMode[preset.value];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex min-h-[190px] flex-col items-center rounded-2xl border px-3.5 py-4 text-center transition duration-200 ${
        selected
          ? "border-blue-500 bg-white shadow-[0_10px_30px_rgba(37,99,235,0.10)] ring-2 ring-blue-100"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md hover:shadow-slate-200/60"
      }`}
    >
      {selected && (
        <span className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      <div className="flex h-[78px] w-[78px] shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-gradient-to-br from-slate-50 to-blue-50 transition duration-200 group-hover:scale-[1.04]">
        <Image
          src={illustration}
          alt=""
          width={78}
          height={78}
          aria-hidden="true"
          className="h-full w-full object-contain p-1"
        />
      </div>
      <p className="mt-3 text-[15px] font-extrabold leading-5 text-slate-950">{preset.label}</p>
      <p className="mt-1.5 max-w-[185px] text-xs leading-[1.45] text-slate-500">{preset.description}</p>
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
    {
      icon: Store,
      label: "Business type",
      value: preset?.label ?? "Shoes Store",
    },
    {
      icon: Box,
      label: "Product engine",
      value: preset?.productHint ?? "Variant products",
    },
    {
      icon: Link2,
      label: "Store URL",
      value: storeUrl,
    },
    {
      icon: UserRound,
      label: "Owner access",
      value: "POS + inventory + online store",
    },
  ];

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_6px_22px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
          Your business setup
        </p>
        <span className="hidden text-xs text-slate-400 sm:block">You can change this later.</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`flex min-w-0 items-start gap-3 ${index > 0 ? "lg:border-l lg:border-slate-200 lg:pl-4" : ""}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
                <p className="mt-1 break-words text-sm font-bold leading-5 text-slate-900">{item.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SetupPreviewPanel({ preset }: { preset: BusinessModePreset | null }) {
  const current = preset ?? getBusinessModePreset("shoes");
  const Icon = current ? iconByMode[current.value] : ShoppingBag;

  return (
    <aside className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_90%_10%,rgba(35,109,255,0.5),transparent_25%),linear-gradient(145deg,#03132f_0%,#06285d_56%,#07468f_100%)] p-6 text-white shadow-[0_24px_60px_rgba(3,19,47,0.25)] sm:p-7 xl:sticky xl:top-6 xl:h-fit">
      <div className="pointer-events-none absolute -right-14 top-20 h-48 w-48 rounded-full border border-blue-300/10 bg-blue-500/10" />
      <div className="pointer-events-none absolute -right-6 top-32 h-28 w-28 rounded-full bg-blue-400/10 blur-sm" />

      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-300">Your setup preview</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-white sm:text-[34px] sm:leading-[1.08]">
          One choice configures your entire POS.
        </h2>
        <p className="mt-3 text-sm leading-6 text-blue-100/85">
          We&apos;ll pre-configure the right features, menus and settings based on your business type.
        </p>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-inner shadow-black/10">
          <Image
            src="/tenh-pos-onboarding-preview.svg"
            alt="Tenh POS product and checkout preview"
            width={900}
            height={520}
            className="h-auto w-full"
          />
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200 ring-1 ring-white/10">
            <Icon size={24} />
          </div>
          <div>
            <p className="font-bold text-white">{current?.label ?? "Shoes Store"}</p>
            <p className="mt-1 text-xs leading-5 text-blue-100/75">
              {current?.description ?? "Manage sizes, colours, SKU and variations."}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3 text-sm text-blue-50/90">
          <PreviewFeature icon={Box}>Product & inventory management</PreviewFeature>
          <PreviewFeature icon={ShoppingCart}>Sales and checkout (POS)</PreviewFeature>
          <PreviewFeature icon={UsersRound}>Customer and order history</PreviewFeature>
          <PreviewFeature icon={BarChart3}>Reports and analytics</PreviewFeature>
          <PreviewFeature icon={Smartphone}>Works on web, tablet and mobile</PreviewFeature>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-[#061b40]/55 p-5">
          <div className="flex gap-3">
            <span className="text-4xl font-black leading-none text-blue-300">“</span>
            <div>
              <p className="text-sm italic leading-6 text-blue-50/90">
                Simple to set up, powerful enough to grow with you.
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Tenh POS</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PreviewFeature({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
        <Check size={14} strokeWidth={3} />
      </span>
      <Icon size={16} className="text-blue-300" />
      <span>{children}</span>
    </div>
  );
}

function StoreDetailsForm({
  formAction,
  pending,
  state,
  businessMode,
  businessName,
  setBusinessName,
  subdomain,
  setSubdomain,
  subdomainTouched,
  setSubdomainTouched,
  selectedPreset,
  onBack,
}: {
  formAction: (payload: FormData) => void;
  pending: boolean;
  state: typeof initialGetStartedState;
  businessMode: string;
  businessName: string;
  setBusinessName: (value: string) => void;
  subdomain: string;
  setSubdomain: (value: string) => void;
  subdomainTouched: boolean;
  setSubdomainTouched: (value: boolean) => void;
  selectedPreset: BusinessModePreset | null;
  onBack: () => void;
}) {
  return (
    <form action={formAction} className="mt-8 space-y-6">
      <input type="hidden" name="businessMode" value={businessMode} />
      <div className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Change business type
        </button>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Store details</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-4xl">
          Set up your Tenh POS business
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {selectedPreset?.label} will use{" "}
          <span className="font-semibold text-slate-800">
            {selectedPreset?.productHint.toLowerCase()}
          </span>
          . You can adjust the mode later as the business grows.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Business name" htmlFor="businessName" className="sm:col-span-2">
          <input
            id="businessName"
            name="businessName"
            required
            minLength={2}
            maxLength={100}
            value={businessName}
            onChange={(event) => {
              const value = event.target.value;
              setBusinessName(value);
              if (!subdomainTouched) {
                setSubdomain(normalizeTenantSlug(value));
              }
            }}
            className={inputClass}
            placeholder="My Shop"
          />
        </Field>

        <Field label="Store address" htmlFor="subdomain" className="sm:col-span-2">
          <div className="flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
            <input
              id="subdomain"
              name="subdomain"
              required
              minLength={2}
              maxLength={40}
              value={subdomain}
              onChange={(event) => {
                setSubdomainTouched(true);
                setSubdomain(normalizeTenantSlug(event.target.value));
              }}
              className="min-w-0 flex-1 px-4 py-3 text-slate-900 outline-none"
              placeholder="my-shop"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
              .tenh-pos.com
            </span>
          </div>
        </Field>

      </div>

      {state.message && !state.success && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating your business..." : "Create my business"}
        {!pending && <ArrowRight size={18} />}
      </button>

      <p className="text-center text-xs leading-5 text-slate-500">
        Your account is already created. This step creates your business workspace, store URL and owner access.
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
