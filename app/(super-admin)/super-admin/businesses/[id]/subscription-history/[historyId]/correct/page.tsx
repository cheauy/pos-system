import Link from "next/link";
import {
  notFound,
} from "next/navigation";

import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  History,
} from "lucide-react";


import {
  requireSuperAdmin,
} from "@/lib/auth/require-super-admin";
import {
  supabaseAdmin,
} from "@/lib/supabase/admin";

import {
  correctSubscriptionExtension,
} from "./actions";

type PageProps = {
  params: Promise<{
    id: string;
    historyId: string;
  }>;
};

export default async function CorrectExtensionPage({
  params,
}: PageProps) {
  await requireSuperAdmin();

  const { id, historyId } =
    await params;

  const {
    data: history,
    error,
  } = await supabaseAdmin
    .from("subscription_history")
    .select(`
      id,
      business_id,
      action,
      months,
      previous_expiry,
      new_expiry,
      created_at
    `)
    .eq("id", historyId)
    .eq("business_id", id)
    .maybeSingle();

  if (
    error ||
    !history ||
    history.action !== "extended"
  ) {
    notFound();
  }

return (
  <main className="pb-8">
    <div className="w-full">
      <Link
        href={`/super-admin/businesses/${id}`}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to business
      </Link>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-6 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <CalendarClock className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                Correct subscription extension
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Replace the original extension
                with the correct duration. This
                action will be recorded in the
                business activity history.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Original extension
              </p>

              <p className="mt-2 text-lg font-bold text-slate-900">
                {history.months}{" "}
                {history.months === 1
                  ? "month"
                  : "months"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Previous expiry
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-900">
                {formatDate(
                  history.previous_expiry,
                )}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Resulting expiry
              </p>

              <p className="mt-2 text-sm font-semibold text-blue-950">
                {formatDate(
                  history.new_expiry,
                )}
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

            <div>
              <p className="text-sm font-semibold text-amber-900">
                Use corrections carefully
              </p>

              <p className="mt-1 text-sm leading-6 text-amber-800">
                This replaces the original
                extension rather than adding
                another extension. Include a
                clear reason for the audit
                history.
              </p>
            </div>
          </div>

          <form
            action={
              correctSubscriptionExtension
            }
            className="mt-7 space-y-6"
          >
            <input
              type="hidden"
              name="businessId"
              value={id}
            />

            <input
              type="hidden"
              name="historyId"
              value={historyId}
            />

            <div>
              <label
                htmlFor="months"
                className="block text-sm font-semibold text-slate-800"
              >
                Correct extension duration
              </label>

              <p className="mt-1 text-sm text-slate-500">
                Select the duration that should
                have been applied originally.
              </p>

              <select
                id="months"
                name="months"
                required
                defaultValue=""
                className="mt-3 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option
                  value=""
                  disabled
                >
                  Select extension duration
                </option>

                <option value="1">
                  1 month
                </option>

                <option value="3">
                  3 months
                </option>

                <option value="5">
                  5 months
                </option>

                <option value="12">
                  12 months
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="reason"
                className="block text-sm font-semibold text-slate-800"
              >
                Correction reason
              </label>

              <p className="mt-1 text-sm text-slate-500">
                Explain why the original
                extension was incorrect.
              </p>

              <textarea
                id="reason"
                name="reason"
                required
                minLength={10}
                rows={5}
                placeholder="Example: The customer requested 5 months, but 12 months was selected accidentally."
                className="mt-3 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
              <Link
                href={`/super-admin/businesses/${id}`}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </Link>

              <PendingSubmitButton
  pendingText="Saving correction..."
  className="h-12 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
>
  Save correction
</PendingSubmitButton>
            </div>
          </form>
        </div>
      </section>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
        <History className="h-4 w-4" />
        All corrections are recorded in
        business activity history.
      </div>
    </div>
  </main>
);
}
function formatDate(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "medium",
    },
  ).format(date);
}
