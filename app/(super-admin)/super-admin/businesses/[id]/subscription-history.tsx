import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Pencil,
  PlusCircle,
  UserRound,
} from "lucide-react";

import { supabaseAdmin } from "@/lib/supabase/admin";

type SubscriptionAction =
  | "created"
  | "extended"
  | "corrected";

type HistoryRecord = {
  id: string;
  action: SubscriptionAction;
  months: number;
  previous_expiry: string | null;
  new_expiry: string;
  reason: string | null;
  corrected_from_id: string | null;
  created_by: string | null;
  created_at: string;
};

type CreatorProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type SubscriptionHistoryProps = {
  businessId: string;
};

export async function SubscriptionHistory({
  businessId,
}: SubscriptionHistoryProps) {
  const {
    data: historyData,
    error: historyError,
  } = await supabaseAdmin
    .from("subscription_history")
   .select(`
  id,
  action,
  months,
  previous_expiry,
  new_expiry,
  reason,
  corrected_from_id,
  created_by,
  created_at
`)
    .eq("business_id", businessId)
    .order("created_at", {
      ascending: false,
    });

  if (historyError) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-bold text-red-900">
          Unable to load subscription history
        </h2>

        <p className="mt-1 text-sm text-red-700">
          {historyError.message}
        </p>
      </section>
    );
  }

  const history =
    (historyData ?? []) as HistoryRecord[];

    const correctedHistoryIds = new Set(
  history
    .map((item) => item.corrected_from_id)
    .filter(
      (value): value is string =>
        Boolean(value),
    ),
);

  const creatorIds = [
    ...new Set(
      history
        .map((item) => item.created_by)
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    ),
  ];

  let creators: CreatorProfile[] = [];

  if (creatorIds.length > 0) {
    const {
      data: creatorData,
      error: creatorError,
    } = await supabaseAdmin
      .from("profiles")
      .select(`
        id,
        full_name,
        email
      `)
      .in("id", creatorIds);

    if (!creatorError) {
      creators =
        (creatorData ?? []) as CreatorProfile[];
    }
  }

  const creatorMap = new Map(
    creators.map((creator) => [
      creator.id,
      creator,
    ]),
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-50 p-3 text-violet-600">
            <Clock3 size={21} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Subscription History
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              A permanent record of subscription
              creation, extensions and corrections.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
            <CalendarDays
              size={32}
              className="mx-auto text-slate-400"
            />

            <p className="mt-3 font-semibold text-slate-700">
              No subscription history
            </p>

            <p className="mt-1 text-sm text-slate-500">
              New subscription activity will appear
              here.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {history.map((item, index) => {
              const creator = item.created_by
                ? creatorMap.get(item.created_by)
                : null;

                 const wasCorrected =
                    correctedHistoryIds.has(item.id);

                    const isLatest =
                    index === 0;
              const isLast =
                index === history.length - 1;

              return (
                <div
                  key={item.id}
                  className="relative flex gap-4"
                >
                  {!isLast && (
                    <div className="absolute left-[19px] top-10 h-[calc(100%-16px)] w-px bg-slate-200" />
                  )}

                  <div
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getActionIconStyle(
                      item.action,
                    )}`}
                  >
                    {getActionIcon(item.action)}
                  </div>

                  <article className="mb-6 min-w-0 flex-1 rounded-2xl border border-slate-200 p-5">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getActionBadgeStyle(
                              item.action,
                            )}`}
                          >
                            {formatAction(
                              item.action,
                            )}
                          </span>

                          <span className="font-bold text-slate-900">
                            {getMonthsText(
                              item.action,
                              item.months,
                            )}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-slate-500">
                          {getActionDescription(
                            item.action,
                          )}
                        </p>
                      </div>

                      <time className="shrink-0 text-xs font-medium text-slate-500">
                        {formatDateTime(
                          item.created_at,
                        )}
                      </time>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <ExpiryBox
                        label="Previous expiry"
                        value={
                          item.previous_expiry
                        }
                      />

                      <ExpiryBox
                        label="New expiry"
                        value={item.new_expiry}
                      />
                    </div>

                    {item.reason && (
                      <div className="mt-4 rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Reason
                        </p>

                        <p className="mt-1 text-sm text-slate-700">
                          {item.reason}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <UserRound size={16} />

                        <span>
                          {creator?.full_name ??
                            creator?.email ??
                            (item.created_by
                              ? "Unknown administrator"
                              : "Administrator not recorded")}
                        </span>
                      </div>

                     {item.action === "extended" &&
  isLatest &&
  !wasCorrected && (
                        <Link
                          href={`/super-admin/businesses/${businessId}/subscription-history/${item.id}/correct`}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          <Pencil size={15} />
                          Correct Extension
                        </Link>
                      )}
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function ExpiryBox({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 font-semibold text-slate-900">
        {value
          ? formatDate(value)
          : "Not previously set"}
      </p>
    </div>
  );
}

function getActionIcon(
  action: SubscriptionAction,
) {
  if (action === "created") {
    return <CheckCircle2 size={18} />;
  }

  if (action === "corrected") {
    return <Pencil size={18} />;
  }

  return <PlusCircle size={18} />;
}

function getActionIconStyle(
  action: SubscriptionAction,
): string {
  if (action === "created") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (action === "corrected") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-blue-100 text-blue-700";
}

function getActionBadgeStyle(
  action: SubscriptionAction,
): string {
  if (action === "created") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (action === "corrected") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-blue-50 text-blue-700";
}

function formatAction(
  action: SubscriptionAction,
): string {
  if (action === "created") {
    return "Created";
  }

  if (action === "corrected") {
    return "Corrected";
  }

  return "Extended";
}

function getMonthsText(
  action: SubscriptionAction,
  months: number,
): string {
  const amount = `${months} Month${
    months === 1 ? "" : "s"
  }`;

  if (action === "extended") {
    return `+${amount}`;
  }

  return amount;
}

function getActionDescription(
  action: SubscriptionAction,
): string {
  if (action === "created") {
    return "The initial subscription was created.";
  }

  if (action === "corrected") {
    return "A previous subscription extension was corrected.";
  }

  return "The subscription expiry was extended.";
}

function formatDate(
  value: string,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(
  value: string,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}