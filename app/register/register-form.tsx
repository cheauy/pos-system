"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coffee,
  Eye,
  EyeOff,
  Gem,
  Laptop,
  Package,
  Shirt,
  ShoppingBasket,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
} from "lucide-react";

import {
  businessModePresets,
  getBusinessModePreset,
} from "@/lib/business/business-mode-presets";
import {
  getRootDomain,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

import { registerOwnerBusiness } from "./actions";
import { initialRegisterBusinessState } from "./state";

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

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerOwnerBusiness,
    initialRegisterBusinessState,
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [businessMode, setBusinessMode] =
    useState("");
  const [businessName, setBusinessName] =
    useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainTouched, setSubdomainTouched] =
    useState(false);
  const [showPassword, setShowPassword] =
    useState(false);
  const selectedPreset = useMemo(
    () => getBusinessModePreset(businessMode),
    [businessMode],
  );

  useEffect(() => {
    if (!state.success || !state.destination) {
      return;
    }

    window.location.assign(state.destination);
  }, [state.success, state.destination]);

  if (
    state.success &&
    state.requiresEmailConfirmation
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={32} />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">
            Your store is created
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {state.message}
          </p>
          <Link
            href="/login"
            className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            Go to sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-3 text-slate-950"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Store size={22} />
            </div>
            <div>
              <p className="font-bold">TENH POS</p>
              <p className="text-xs text-slate-500">
                Create your business
              </p>
            </div>
          </Link>

          <Link
            href="/login"
            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Already have an account?
          </Link>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  step === 1
                    ? "bg-blue-600 text-white"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {step === 1 ? "1" : "✓"}
              </span>
              <span>Business mode</span>
              <div className="h-px flex-1 bg-slate-200" />
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  step === 2
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                2
              </span>
              <span>Store details</span>
            </div>

            {step === 1 ? (
              <div className="mt-8">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">
                  Start here
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                  What kind of business do you run?
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Choose the closest mode. TENH will automatically prepare the existing POS and product setup for that business.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {businessModePresets.map((preset) => {
                    const Icon =
                      iconByMode[preset.value];
                    const selected =
                      businessMode === preset.value;

                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() =>
                          setBusinessMode(preset.value)
                        }
                        className={`rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                              selected
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            <Icon size={21} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">
                              {preset.label}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-blue-600">
                              {preset.productHint}
                            </p>
                            <p className="mt-2 text-sm leading-5 text-slate-500">
                              {preset.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={!businessMode}
                  onClick={() => setStep(2)}
                  className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                  <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <form
                action={formAction}
                className="mt-8 space-y-6"
              >
                <input
                  type="hidden"
                  name="businessMode"
                  value={businessMode}
                />
                <div
                  className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden"
                  aria-hidden="true"
                >
                  <label htmlFor="website">
                    Website
                  </label>
                  <input
                    id="website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
                  >
                    <ArrowLeft size={16} />
                    Change business mode
                  </button>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
                    Create your TENH POS store
                  </h1>
                  <p className="mt-2 text-sm text-slate-600">
                    {selectedPreset?.label} will use {" "}
                    <span className="font-semibold text-slate-800">
                      {selectedPreset?.productHint.toLowerCase()}
                    </span>
                    . You can adjust the mode later as the business grows.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Business name"
                    htmlFor="businessName"
                    className="sm:col-span-2"
                  >
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
                          setSubdomain(
                            normalizeTenantSlug(value),
                          );
                        }
                      }}
                      className={inputClass}
                      placeholder="My Shop"
                    />
                  </Field>

                  <Field
                    label="Store address"
                    htmlFor="subdomain"
                    className="sm:col-span-2"
                  >
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
                          setSubdomain(
                            normalizeTenantSlug(
                              event.target.value,
                            ),
                          );
                        }}
                        className="min-w-0 flex-1 px-4 py-3 text-slate-900 outline-none"
                        placeholder="my-shop"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
                        .{getRootDomain()}
                      </span>
                    </div>
                  </Field>

                  <Field
                    label="Owner full name"
                    htmlFor="ownerName"
                  >
                    <input
                      id="ownerName"
                      name="ownerName"
                      required
                      minLength={2}
                      maxLength={100}
                      className={inputClass}
                      placeholder="Your name"
                    />
                  </Field>

                  <Field label="Email" htmlFor="email">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      className={inputClass}
                      placeholder="owner@example.com"
                    />
                  </Field>

                  <Field
                    label="Password"
                    htmlFor="password"
                  >
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={
                          showPassword
                            ? "text"
                            : "password"
                        }
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className={`${inputClass} pr-12`}
                        placeholder="At least 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword(
                            (current) => !current,
                          )
                        }
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        {showPassword ? (
                          <EyeOff size={19} />
                        ) : (
                          <Eye size={19} />
                        )}
                      </button>
                    </div>
                  </Field>

                  <Field
                    label="Confirm password"
                    htmlFor="confirmPassword"
                  >
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className={inputClass}
                      placeholder="Repeat password"
                    />
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending
                    ? "Creating your store..."
                    : "Create my store"}
                  {!pending && <ArrowRight size={18} />}
                </button>

                <p className="text-center text-xs leading-5 text-slate-500">
                  New self-registered stores start with the existing one-month access period and can be managed by TENH Admin afterward.
                </p>
              </form>
            )}
          </section>

          <aside className="h-fit rounded-3xl bg-slate-950 p-6 text-white lg:sticky lg:top-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Your setup
            </p>
            <h2 className="mt-3 text-2xl font-bold">
              One choice configures the existing POS.
            </h2>
            <div className="mt-6 space-y-4 text-sm text-slate-300">
              <SummaryItem
                title="Business type"
                value={
                  selectedPreset?.label ??
                  "Choose a mode first"
                }
              />
              <SummaryItem
                title="Product engine"
                value={
                  selectedPreset?.productHint ?? "—"
                }
              />
              <SummaryItem
                title="Store URL"
                value={`${
                  subdomain || "your-shop"
                }.${getRootDomain()}`}
              />
              <SummaryItem
                title="Owner access"
                value="POS + inventory + online store"
              />
            </div>

            {selectedPreset && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">
                  {selectedPreset.shortLabel} setup
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {selectedPreset.description}
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
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
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SummaryItem({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-1 font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
