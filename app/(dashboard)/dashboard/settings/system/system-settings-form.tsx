"use client";

import {
  useActionState,
} from "react";

import {
  Building2,
  Save,
} from "lucide-react";

import {
  updateAppearanceSettings,
  type AppearanceActionState,
} from "./actions";

export type SystemSettings = {
  id: string;

  receipt_header: string;
  receipt_footer: string;
  receipt_paper_size: string;
  show_business_phone: boolean;
  show_business_address: boolean;
  show_cashier_name: boolean;
  show_customer_name: boolean;
  show_tax_on_receipt: boolean;

  order_prefix: string;
  starting_order_number: number;
  allow_order_discount: boolean;
  require_customer: boolean;
  require_payment_before_complete: boolean;

  enable_returns: boolean;
  return_period_days: number;
  require_return_reason: boolean;
  allow_return_without_receipt: boolean;

  default_theme: string;
  default_language: string;
  date_format: string;
  compact_sidebar: boolean;
  show_dashboard_charts: boolean;
};

type SystemSettingsFormProps = {
  settings: SystemSettings;
};
const initialState: AppearanceActionState = {
  success: false,
  message: "",
};

export default function SystemSettingsForm({
  settings,
}: SystemSettingsFormProps) {
  const [state, formAction, pending] =
    useActionState(
      updateAppearanceSettings,
      initialState,
    );

  return (
    <form
      action={formAction}
      className="space-y-8"
    >
      <input
        type="hidden"
        name="settings_id"
        value={settings.id}
      />

      <section className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-3">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>

          <div>
            <h2 className="text-lg font-semibold">
              Business Information
            </h2>

            <p className="text-sm text-gray-500">
              Information displayed in your POS
              and receipts.
            </p>
          </div>
        </div>

       

       
      </section>

      <section className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">
            Sales Preferences
          </h2>

          <p className="text-sm text-gray-500">
            Configure currency, tax, and inventory
            defaults.
          </p>
        </div>

       
      </section>

      <section className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">
            Receipt Preferences
          </h2>

          <p className="text-sm text-gray-500">
            Customize the message printed at the
            bottom of receipts.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="receipt_footer"
            className="text-sm font-medium"
          >
            Receipt Footer
          </label>

          <textarea
            id="receipt_footer"
            name="receipt_footer"
            rows={4}
            defaultValue={
              settings.receipt_footer
            }
            placeholder="Thank you for your purchase!"
            className="w-full rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </section>

      {state.message && (
        <div
          className={
            state.success
              ? "rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
              : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          }
        >
          {state.message}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />

          {pending
            ? "Saving..."
            : "Save Settings"}
        </button>
      </div>
    </form>
  );
}

type FieldProps = {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
};

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
  min,
  max,
  step,
}: FieldProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={name}
        className="text-sm font-medium"
      >
        {label}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}