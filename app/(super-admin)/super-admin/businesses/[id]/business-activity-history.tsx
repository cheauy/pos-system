import {
  Ban,
  CheckCircle2,
  CreditCard,
  Package,
  PencilLine,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";

import { supabaseAdmin } from "@/lib/supabase/admin";

type BusinessActivityHistoryProps = {
  businessId: string;
};

type ProfileRecord = {
  full_name: string | null;
  email: string | null;
};

type ActivityRecord = {
  id: string;
  action: string;
  title: string;
  description: string | null;
  reason: string | null;
  previous_values: Record<
    string,
    unknown
  > | null;
  new_values: Record<
    string,
    unknown
  > | null;
  metadata: Record<
    string,
    unknown
  > | null;
  created_at: string;
  profiles:
    | ProfileRecord
    | ProfileRecord[]
    | null;
};

function formatAction(action: string) {
  return action
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(date));
}

function formatFieldLabel(key: string) {
  const labels: Record<
    string,
    string
  > = {
    max_staff: "Maximum Staff",
    active_staff_count:
      "Active Staff",
    product_mode: "Product Mode",
    name: "Business Name",
    is_active: "Active Status",
    extension_months:
  "Extension Duration",
subscription_expires_at:
  "Subscription Expiry",
    scheduled_deletion_at:
      "Scheduled Deletion",
    disabled_reason:
      "Disabled Reason",
  };

  return (
    labels[key] ??
    key
      .split("_")
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1),
      )
      .join(" ")
  );
}

function formatFieldValue(
  value: unknown,
  key?: string,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    key?.includes("_at") ||
    key?.includes("expiry")
  ) {
    const date = new Date(
      String(value),
    );

    if (
      !Number.isNaN(date.getTime())
    ) {
      return new Intl.DateTimeFormat(
        "en-GB",
        {
          dateStyle: "medium",
          timeStyle: "short",
        },
      ).format(date);
    }
  }

  if (
    key === "extension_months" &&
    typeof value === "number"
  ) {
    return `${value} ${
      value === 1
        ? "month"
        : "months"
    }`;
  }

  if (Array.isArray(value)) {
    return value.length
      ? value.join(", ")
      : "None";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function HistoryValues({
  values,
}: {
  values: Record<string, unknown>;
}) {
  return (
    <div className="mt-3 space-y-2">
      {Object.entries(values).map(
        ([key, value]) => (
          <div
            key={key}
            className="flex items-start justify-between gap-4 border-b border-slate-200 pb-2 last:border-b-0 last:pb-0"
          >
            <span className="text-sm text-slate-600">
              {formatFieldLabel(key)}
            </span>

            <span className="max-w-[60%] break-words text-right text-sm font-semibold text-slate-900">
              {formatFieldValue(value, key)}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function getHistoryAppearance(
  action: string,
) {
  switch (action) {
    case "staff_limit_changed":
      return {
        icon: Users,
        badge: "Staff Limit",
        iconClass:
          "bg-orange-100 text-orange-700",
        badgeClass:
          "bg-orange-100 text-orange-700",
      };

      case "subscription_extension_corrected":
  return {
    icon: PencilLine,
    badge: "Correction",
    iconClass:
      "bg-indigo-100 text-indigo-700",
    badgeClass:
      "bg-indigo-100 text-indigo-700",
  };

    case "product_mode_changed":
      return {
        icon: Package,
        badge: "Product Mode",
        iconClass:
          "bg-blue-100 text-blue-700",
        badgeClass:
          "bg-blue-100 text-blue-700",
      };

    case "business_suspended":
      return {
        icon: Ban,
        badge: "Suspended",
        iconClass:
          "bg-red-100 text-red-700",
        badgeClass:
          "bg-red-100 text-red-700",
      };

    case "business_restored":
      return {
        icon: CheckCircle2,
        badge: "Restored",
        iconClass:
          "bg-green-100 text-green-700",
        badgeClass:
          "bg-green-100 text-green-700",
      };

    case "business_deleted_scheduled":
  return {
    icon: Trash2,
    badge: "Deletion Scheduled",
    iconClass:
      "bg-red-100 text-red-700",
    badgeClass:
      "bg-red-100 text-red-700",
  };

    case "subscription_extended":
    case "subscription_reactivated":
      return {
        icon: CreditCard,
        badge: "Subscription",
        iconClass:
          "bg-purple-100 text-purple-700",
        badgeClass:
          "bg-purple-100 text-purple-700",
      };

    case "business_deletion_cancelled":
      return {
        icon: RefreshCw,
        badge:
          "Deletion Cancelled",
        iconClass:
          "bg-cyan-100 text-cyan-700",
        badgeClass:
          "bg-cyan-100 text-cyan-700",
      };

    default:
      return {
        icon: CheckCircle2,
        badge: "Activity",
        iconClass:
          "bg-slate-100 text-slate-700",
        badgeClass:
          "bg-slate-100 text-slate-700",
      };
  }
}

function getProfile(
  profiles:
    | ProfileRecord
    | ProfileRecord[]
    | null,
) {
  if (!profiles) {
    return null;
  }

  if (Array.isArray(profiles)) {
    return profiles[0] ?? null;
  }

  return profiles;
}

export async function BusinessActivityHistory({
  businessId,
}: BusinessActivityHistoryProps) {
  const {
    data: activityHistory,
    error,
  } = await supabaseAdmin
    .from(
      "business_activity_history",
    )
    .select(`
      id,
      action,
      title,
      description,
      reason,
      previous_values,
      new_values,
      metadata,
      created_at,
      profiles:created_by (
        full_name,
        email
      )
    `)
    .eq("business_id", businessId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-semibold text-red-900">
          Business activity history
        </h2>

        <p className="mt-2 text-sm text-red-700">
          Unable to load activity
          history: {error.message}
        </p>
      </section>
    );
  }

  const history =
    (activityHistory ??
      []) as ActivityRecord[];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">
          Business activity history
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Important changes made to
          this business.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            No business activity yet
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Staff limit, product mode,
            suspension and restoration
            changes will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {history.map((item) => {
            const appearance =
              getHistoryAppearance(
                item.action,
              );

            const Icon =
              appearance.icon;

            const profile =
              getProfile(
                item.profiles,
              );

            const changedBy =
              profile?.full_name ||
              profile?.email ||
              "System";

            return (
              <article
                key={item.id}
                className="flex gap-4 px-6 py-5"
              >
                <div
                  className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${appearance.iconClass}`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-slate-900">
                          {item.title ||
                            formatAction(
                              item.action,
                            )}
                        </h3>

                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${appearance.badgeClass}`}
                        >
                          {
                            appearance.badge
                          }
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-600">
                        {item.description ??
                          formatAction(
                            item.action,
                          )}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        Changed by{" "}
                        <span className="font-medium text-slate-700">
                          {changedBy}
                        </span>
                      </p>
                    </div>

                    <time className="shrink-0 text-xs text-slate-500">
                      {formatDate(
                        item.created_at,
                      )}
                    </time>
                  </div>

                  {item.reason && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <span className="font-medium">
                        Reason:
                      </span>{" "}
                      {item.reason}
                    </div>
                  )}

                  {(item.previous_values ||
                    item.new_values) && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {item.previous_values && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Previous
                          </p>

                          <HistoryValues
                            values={
                              item.previous_values
                            }
                          />
                        </div>
                      )}

                      {item.new_values && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            New
                          </p>

                          <HistoryValues
                            values={
                              item.new_values
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {item.metadata &&
                    typeof item.metadata
                      .disabled_staff_count ===
                      "number" &&
                    item.metadata
                      .disabled_staff_count >
                      0 && (
                      <p className="mt-3 text-sm text-orange-700">
                        {
                          item.metadata
                            .disabled_staff_count as number
                        }{" "}
                        staff account(s)
                        disabled automatically.
                      </p>
                    )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}