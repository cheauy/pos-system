import Link from "next/link";
import { ArrowLeft, AtSign, CalendarDays, SlidersHorizontal } from "lucide-react";

import { requirePermission } from "@/lib/auth/require-permission";
import { getCustomerFieldSettings } from "@/lib/customers/get-customer-field-settings";
import { updateCustomerFieldSettings } from "./actions";

export default async function CustomerSettingsPage() {
  const business = await requirePermission("business.update");
  const settings = await getCustomerFieldSettings(business.id);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
        >
          <ArrowLeft size={17} />
          Back to Customers
        </Link>

        <div className="mt-4 flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
            <SlidersHorizontal size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">
              Customer Fields
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Choose which optional customer fields your team can see and edit.
            </p>
          </div>
        </div>
      </div>

      <form
        action={updateCustomerFieldSettings}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <SettingRow
          icon={<AtSign size={19} />}
          title="Email"
          description="Show the Email field when creating, editing, viewing and searching customers."
          name="emailEnabled"
          defaultChecked={settings.emailEnabled}
        />
        <SettingRow
          icon={<CalendarDays size={19} />}
          title="Birthday"
          description="Show the Birthday field in customer forms and customer details."
          name="birthdayEnabled"
          defaultChecked={settings.birthdayEnabled}
        />

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-500">
            Disabling a field hides it. Existing saved values are not deleted.
          </p>
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Save settings
          </button>
        </div>
      </form>
    </main>
  );
}

function SettingRow({
  icon,
  title,
  description,
  name,
  defaultChecked,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  name: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 border-b border-slate-100 px-6 py-5 last:border-b-0">
      <span className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-600">
          {icon}
        </span>
        <span>
          <span className="block font-semibold text-slate-900">{title}</span>
          <span className="mt-1 block text-sm text-slate-500">{description}</span>
        </span>
      </span>

      <span className="relative inline-flex shrink-0 items-center">
        <input
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-blue-600" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
