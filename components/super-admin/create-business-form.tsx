"use client";

import { useActionState ,useEffect } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Loader2,
  UserPlus,
} from "lucide-react";

import {
  createCustomerBusiness,
} from "@/app/(super-admin)/super-admin/businesses/new/actions";
import {
  initialCreateBusinessState,
} from "@/app/(super-admin)/super-admin/businesses/new/state";
import {
  getRootDomain,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";


function previewExpiryDate(
  months: number,
): string {
  const date = new Date();

  date.setMonth(
    date.getMonth() + months,
  );

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

type BusinessDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export type BusinessHistoryAction =
  | "business_suspended"
  | "business_restored"
  | "business_deletion_cancelled"
  | "staff_limit_changed"
  | "product_mode_changed"
  | "business_updated"
  | "subscription_extended"
  | "subscription_reactivated"
  | "business_deleted";

export default function CreateBusinessForm({}
  
) {
  const [state, formAction, pending] =
    useActionState(
      createCustomerBusiness,
      initialCreateBusinessState,
    );

    const router = useRouter();

const [businessName, setBusinessName] =
  useState("");
const [subdomain, setSubdomain] =
  useState("");
const [subdomainTouched, setSubdomainTouched] =
  useState(false);

useEffect(() => {
  if (!state.success) return;

  const timer = setTimeout(() => {
    router.push("/super-admin/businesses");
    router.refresh();
  }, 1500);

  return () => clearTimeout(timer);
}, [state.success, router]);

  const subscriptionOptions = [1, 3, 5, 12];

const [
  subscriptionMonths,
  setSubscriptionMonths,
] = useState(1);

  const staffPresets = [
  3,
  5,
  10,
  15,
  20,
  25,
  30,
  50,
];

const [maxStaff, setMaxStaff] = useState(3);
const [isCustomStaff, setIsCustomStaff] =
  useState(false);

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <section>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
            <Building2 size={22} />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Customer Business
            </h2>

            <p className="text-sm text-slate-500">
              Create a new customer workspace
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <FormField
            label="Business name"
            htmlFor="businessName"
          >
            <input
              id="businessName"
              name="businessName"
              required
              minLength={2}
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
              placeholder="Dara Shop"
            />
          </FormField>

          <FormField
            label="TENH POS store address"
            htmlFor="subdomain"
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
                placeholder="dara-shop"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />

              <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
                .{getRootDomain()}
              </span>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Public store: {subdomain || "your-shop"}.{getRootDomain()}
            </p>
          </FormField>
        </div>
      </section>

      <section>
  

        <div className="mt-6 space-y-4">
          <FormField
            label="Owner full name"
            htmlFor="ownerName"
          >
            <input
              id="ownerName"
              name="ownerName"
              required
              minLength={2}
              className={inputClass}
              placeholder="Dara Sok"
            />
          </FormField>

          <FormField
            label="Owner email"
            htmlFor="ownerEmail"
          >
            <input
              id="ownerEmail"
              name="ownerEmail"
              type="email"
              required
              className={inputClass}
              placeholder="dara@example.com"
            />
          </FormField>

          <FormField
            label="Temporary password"
            htmlFor="temporaryPassword"
          >
            <input
              id="temporaryPassword"
              name="temporaryPassword"
              type="password"
              required
              minLength={8}
              className={inputClass}
              placeholder="At least 8 characters"
            />
          </FormField>
        </div>
      </section>

      <div className="border-t border-slate-200" />

      <section>
        <h2 className="text-lg font-semibold text-slate-900">
          Product package
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Every user in this business will use this mode.
        </p>

        <div className="mt-4 space-y-3">
          <ModeOption
            value="standard"
            title="Standard Mode"
            description="One SKU, price and stock quantity per product."
            defaultChecked
          />

          <ModeOption
            value="variant"
            title="Variant Mode"
            description="Products support options such as size and colour."
          />

          <ModeOption
            value="configurable"
            title="Configurable Mode"
            description="Products support configurable selections and combinations."
          />
        </div>
      </section>

  

      <div className="border-t border-slate-200" />

<section>
  <h2 className="text-lg font-semibold text-slate-900">
    Staff limit
  </h2>

  <p className="mt-1 text-sm text-slate-500">
    Choose how many staff accounts this business
    may create. The owner is not included.
  </p>

  <input
    type="hidden"
    name="maxStaff"
    value={maxStaff}
  />

  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {staffPresets.map((value) => {
      const selected =
        !isCustomStaff &&
        maxStaff === value;

      return (
        <button
          key={value}
          type="button"
          onClick={() => {
            setIsCustomStaff(false);
            setMaxStaff(value);
          }}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
            selected
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
          }`}
        >
          {value} users
        </button>
      );
    })}
  </div>

  <button
    type="button"
    onClick={() => {
      setIsCustomStaff(true);

      if (staffPresets.includes(maxStaff)) {
        setMaxStaff(3);
      }
    }}
    className={`mt-3 w-full rounded-xl border p-4 text-left transition ${
      isCustomStaff
        ? "border-blue-500 bg-blue-50"
        : "border-slate-300 bg-white hover:border-blue-300"
    }`}
  >
    <span className="block font-semibold text-slate-900">
      Custom
    </span>

    <span className="mt-1 block text-sm text-slate-500">
      Enter a custom limit between 3 and 100.
    </span>
  </button>

  {isCustomStaff && (
    <div className="mt-4">
      <FormField
        label="Custom staff limit"
        htmlFor="customMaxStaff"
      >
        <input
          id="customMaxStaff"
          type="number"
          min={3}
          max={100}
          step={1}
          required
          value={maxStaff}
          onChange={(event) => {
            const value = event.target.value;

            setMaxStaff(
              value === ""
                ? 3
                : Number(value),
            );
          }}
          className={inputClass}
          placeholder="Enter 3 to 100"
        />
      </FormField>
    </div>
  )}

 
</section>
<section>
  <h2 className="text-lg font-semibold text-slate-900">
    Subscription period
  </h2>

  <p className="mt-1 text-sm text-slate-500">
    Choose how many months the customer purchased.
  </p>

  <input
    type="hidden"
    name="subscriptionMonths"
    value={subscriptionMonths}
  />

  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {subscriptionOptions.map((months) => {
      const selected =
        subscriptionMonths === months;

      return (
        <button
          key={months}
          type="button"
          onClick={() =>
            setSubscriptionMonths(months)
          }
          className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
            selected
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
          }`}
        >
          {months}{" "}
          {months === 1
            ? "Month"
            : "Months"}
        </button>
      );
    })}
  </div>

  <div className="mt-4 rounded-xl bg-slate-50 p-4">
    <div className="flex justify-between gap-4">
      <span className="text-sm text-slate-500">
        Selected period
      </span>

      <span className="font-semibold text-slate-900">
        {subscriptionMonths}{" "}
        {subscriptionMonths === 1
          ? "month"
          : "months"}
      </span>
    </div>

    <div className="mt-3 flex justify-between gap-4">
      <span className="text-sm text-slate-500">
        Estimated expiry
      </span>

      <span className="font-semibold text-slate-900">
        {previewExpiryDate(
          subscriptionMonths,
        )}
      </span>
    </div>
  </div>
</section>
    {state.message && (
        <p
          className={
            state.success
              ? "rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700"
              : "rounded-xl bg-red-50 p-4 text-sm text-red-700"
          }
        >
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2
              size={18}
              className="animate-spin"
            />
            Creating...
          </>
        ) : (
          <>
            <Building2 size={18} />
            Create Business & Owner
          </>
        )}
      </button>
    </form>
  );
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      {children}
    </div>
  );
}

function ModeOption({
  value,
  title,
  description,
  defaultChecked = false,
}: {
  value: string;
  title: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
      <input
        type="radio"
        name="productMode"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 accent-blue-600"
      />

      <span>
        <span className="block font-semibold text-slate-900">
          {title}
        </span>

        <span className="mt-1 block text-sm leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";