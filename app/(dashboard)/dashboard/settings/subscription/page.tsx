import { getBranchEntitlement } from "@/lib/subscriptions/branch-limits";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  HelpCircle,
  History,
  LockKeyhole,
  MapPin,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Store,
  UserPlus,
  UsersRound,
  Wallet,
} from "lucide-react";

import LogoutButton from "@/components/logout-button";
import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getSubscriptionPlanLabel,
  isSubscriptionPlanKey,
  subscriptionPlans,
} from "@/lib/subscriptions/plans";

type BusinessSubscriptionRow = {
  subscription_plan_key: string | null;
  subscription_user_limit: number | null;
  subscription_months: number | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  subscription_status: string | null;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  expired_at: string | null;
  deletion_scheduled_at: string | null;
  trial_block_reason: string | null;
};

type HistoryRow = {
  id: string;
  action: string;
  months: number | null;
  previous_expiry: string | null;
  new_expiry: string | null;
  reason: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  plan_key: string;
  term_months: number;
  requested_user_limit: number;
  total_amount: number | string | null;
  status: string;
  created_at: string;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Phnom_Penh",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Phnom_Penh",
});

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : DATE_FORMATTER.format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_TIME_FORMATTER.format(date);
}

function formatMoney(value: number | string | null) {
  if (value === null) return "Quote";
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "Quote";
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

function termLabel(months: number | null, status: string | null) {
  if (status === "trialing") return "7-day trial";
  if (!months) return "Not set";
  if (months === 12) return "1 year";
  if (months === 1) return "1 month";
  return `${months} months`;
}

function getStatusLabel(status: string | null) {
  switch (status) {
    case "trial_pending":
      return "Trial pending";
    case "trialing":
      return "Free trial";
    case "active":
      return "Active";
    case "expired":
      return "Expired";
    case "trial_blocked":
      return "Trial unavailable";
    default:
      return "Inactive";
  }
}

function subscriptionActionLabel(status: string | null) {
  if (status === "active") return "Upgrade Subscription";
  if (status === "expired") return "Reactivate Subscription";
  return "Choose Subscription";
}

function orderStatus(status: string) {
  switch (status) {
    case "quote_requested":
      return "Quote requested";
    case "pending_payment":
      return "Payment required";
    case "payment_submitted":
      return "Under review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return status.replace(/_/g, " ");
  }
}

function orderStatusClasses(status: string) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 ring-emerald-600/10";
  if (status === "rejected") return "bg-red-50 text-red-700 ring-red-600/10";
  if (status === "payment_submitted") return "bg-amber-50 text-amber-700 ring-amber-600/10";
  if (status === "pending_payment") return "bg-blue-50 text-blue-700 ring-blue-600/10";
  return "bg-slate-100 text-slate-600 ring-slate-500/10";
}

function renewalProgress(startValue: string | null, endValue: string | null) {
  if (!startValue || !endValue) return 0;
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const elapsed = Date.now() - start;
  return Math.max(0, Math.min(100, Math.round((elapsed / (end - start)) * 100)));
}

export default async function SubscriptionSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const business = await getCurrentBusinessForSubscription();
  const branchEntitlement = await getBranchEntitlement(business.id);
  const params = searchParams ? await searchParams : {};

  const [
    { data: subscription, error: subscriptionError },
    { data: history, error: historyError },
    { data: orders, error: ordersError },
    { count: activeMemberCount },
    { count: activeLocationCount },
  ] = await Promise.all([
    supabaseAdmin
      .from("businesses")
      .select(
        "subscription_plan_key,subscription_user_limit,subscription_months,subscription_started_at,subscription_expires_at,subscription_status,trial_started_at,trial_expires_at,expired_at,deletion_scheduled_at,trial_block_reason",
      )
      .eq("id", business.id)
      .maybeSingle(),
    supabaseAdmin
      .from("subscription_history")
      .select("id,action,months,previous_expiry,new_expiry,reason,created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("subscription_orders")
      .select("id,plan_key,term_months,requested_user_limit,total_amount,status,created_at")
      .eq("business_id", business.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(12),
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
  ]);

  if (subscriptionError) {
    throw new Error(`Unable to load subscription: ${subscriptionError.message}`);
  }

  const current = (subscription ?? null) as BusinessSubscriptionRow | null;
  const historyRows = (history ?? []) as HistoryRow[];
  const orderRows = (orders ?? []) as OrderRow[];
  const status = current?.subscription_status ?? business.subscriptionStatus;
  const expiry = current?.subscription_expires_at ?? business.subscriptionExpiresAt;
  const deletionDate = current?.deletion_scheduled_at ?? business.deletionScheduledAt;
  const remainingDays = daysUntil(expiry);
  const deletionDays = daysUntil(deletionDate);
  const locked = business.subscriptionLocked;
  const planKey = current?.subscription_plan_key ?? (status === "trialing" ? "trial" : "legacy");
  const plan = isSubscriptionPlanKey(planKey) ? subscriptionPlans[planKey] : null;
  const activeMembers = activeMemberCount ?? 0;
  const activeLocations = activeLocationCount ?? 0;
  const userLimit = current?.subscription_user_limit ?? plan?.userLimit ?? null;
  const seatPercent = userLimit && userLimit > 0 ? Math.min(100, Math.round((activeMembers / userLimit) * 100)) : 0;
  const teamEnabled = plan?.teamEnabled ?? status === "trialing";
  const renewalStart =
    current?.subscription_started_at ??
    current?.trial_started_at ??
    null;
  const renewalPercent = renewalProgress(renewalStart, expiry);
  const currentTerm = termLabel(current?.subscription_months ?? null, status);
  const freeChangeText = plan
    ? plan.freeUrlChangesPerMonth > 0
      ? `${plan.freeUrlChangesPerMonth} URL + ${plan.freeBusinessModeChangesPerMonth} mode changes free / month`
      : "URL and Business Mode changes use normal pricing"
    : "Standard account change rules apply";
  const subscriptionAction = subscriptionActionLabel(status);

  return (
    <main className="mx-auto w-full max-w-[1540px] space-y-4 pb-10">
      {!locked ? (
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
        >
          <ArrowLeft size={16} />
          Back to General
        </Link>
      ) : null}

      {params.quote === "requested" ? (
        <Notice tone="blue">
          Custom Team quote requested. TENH can set the monthly price in Super Admin; payment becomes available after the quote is created.
        </Notice>
      ) : null}

      {params.upgrade === "team" ? (
        <Notice tone="amber">
          Team users are locked on the Solo plan. Upgrade to Small Team, Growth Team, or Custom Team to add or manage staff.
        </Notice>
      ) : null}

      {status === "expired" ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
                <LockKeyhole size={20} />
              </div>
              <div>
                <h2 className="font-extrabold text-red-950">Business subscription expired</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-red-800">
                  All business pages are locked until the subscription is reactivated. If the business is not reactivated within 180 days after expiry, its workspace and business data will be permanently erased.
                </p>
                <p className="mt-2 text-xs font-semibold text-red-800">
                  Expired {formatDate(expiry)} · Permanent deletion {formatDate(deletionDate)}
                  {deletionDays !== null && deletionDays > 0 ? ` · ${deletionDays} days remaining` : ""}
                </p>
              </div>
            </div>
            <LogoutButton />
          </div>
        </section>
      ) : null}

      {status === "trial_pending" ? (
        <Notice tone="blue" icon={<ShieldAlert size={18} />}>
          Verify the owner email and sign in to start the 7-day free trial.
        </Notice>
      ) : null}

      {status === "trial_blocked" ? (
        <Notice tone="amber" icon={<AlertTriangle size={18} />}>
          Free trial unavailable. Choose a paid subscription to unlock the business workspace.
        </Notice>
      ) : null}

      {status === "trialing" ? (
        <Notice tone="blue" icon={<Clock3 size={18} />}>
          7-day free trial active{remainingDays !== null ? ` · ${Math.max(0, remainingDays)} days remaining` : ""}.
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader
              icon={<ReceiptText size={19} />}
              title="Subscription Overview"
              subtitle="Key details about your current subscription."
            />

            <div className="grid divide-y divide-slate-100 lg:grid-cols-[0.9fr_1.5fr] lg:divide-x lg:divide-y-0 dark:divide-slate-800">
              <div className="space-y-5 p-5">
                <OverviewItem
                  icon={<CreditCard size={16} />}
                  label="Plan"
                  value={getSubscriptionPlanLabel(planKey)}
                  detail={plan?.description ?? (status === "trialing" ? "Explore TENH POS during your free trial." : "TENH POS subscription access.")}
                />
                <OverviewItem
                  icon={<UsersRound size={16} />}
                  label="Team seats"
                  value={userLimit ? `${activeMembers} of ${userLimit} used` : `${activeMembers} active`}
                  detail={teamEnabled ? "Team collaboration is enabled." : "Team collaboration is locked on this plan."}
                />
                <OverviewItem
                  icon={<Store size={16} />}
                  label="Store locations"
                  value={`${activeLocations} active`}
                  detail={`${branchEntitlement.used} of ${branchEntitlement.limit} active branches. Custom Plan costs $5/user and $20/branch per month.`}
                />
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">Renewal timeline</p>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                      {formatDate(renewalStart)} → {formatDate(expiry)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {remainingDays === null ? "No expiry set" : remainingDays <= 0 ? "Expired" : `${remainingDays} days remaining`}
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${renewalPercent}%` }} />
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <MiniDetail
                    icon={<Wallet size={17} />}
                    label="Payment method"
                    value="ABA QR · Manual"
                    detail="Payment reviewed manually"
                  />
                  <MiniDetail
                    icon={<RefreshCw size={17} />}
                    label="Renewal"
                    value="Manual renewal"
                    detail="You control each renewal"
                  />
                  <MiniDetail
                    icon={<CalendarClock size={17} />}
                    label="Billing term"
                    value={currentTerm}
                    detail="One upfront payment per term"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader
              icon={<FileText size={19} />}
              title="Payment requests"
              subtitle="Quotes, payments under review, and approved subscription orders."
              action={
                business.role === "owner" ? (
                  <Link
                    href="/dashboard/settings/subscription/plans"
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    <Sparkles size={15} />
                    {subscriptionAction}
                  </Link>
                ) : undefined
              }
            />

            {ordersError ? (
              <div className="p-6 text-sm text-red-700">Unable to load subscription orders: {ordersError.message}</div>
            ) : orderRows.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                  <ReceiptText size={20} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">No subscription payment requests yet.</p>
                <p className="mt-1 text-xs text-slate-400">{subscriptionAction} when you are ready to continue your TENH POS access.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {orderRows.map((order) => {
                  const canOpen = order.status !== "quote_requested";
                  return (
                    <div key={order.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {getSubscriptionPlanLabel(order.plan_key)} · {order.term_months === 12 ? "1 year" : order.term_months === 1 ? "1 month" : `${order.term_months} months`}
                          </p>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${orderStatusClasses(order.status)}`}>
                            {orderStatus(order.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.requested_user_limit} users · {formatDateTime(order.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <span className="text-sm font-black text-slate-950 dark:text-white">{formatMoney(order.total_amount)}</span>
                        {canOpen ? (
                          <Link
                            href={`/dashboard/settings/subscription/payment/${order.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                          >
                            View <ArrowRight size={14} />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader
              icon={<History size={19} />}
              title="Billing History"
              subtitle="Trial and approved subscription activity."
            />

            {historyError ? (
              <div className="p-6 text-sm text-red-700">Unable to load billing history: {historyError.message}</div>
            ) : historyRows.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">No billing history yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:bg-slate-950/60">
                    <tr>
                      <th className="px-5 py-3">Activity</th>
                      <th className="px-5 py-3">Term</th>
                      <th className="px-5 py-3">Previous expiry</th>
                      <th className="px-5 py-3">New expiry</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {historyRows.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold capitalize text-slate-900 dark:text-white">{item.action.replace(/_/g, " ")}</p>
                          {item.reason ? <p className="mt-1 max-w-[260px] truncate text-[11px] text-slate-400">{item.reason}</p> : null}
                        </td>
                        <td className="px-5 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {Number(item.months ?? 0) === 0 ? "7-day trial" : item.months === 12 ? "1 year" : item.months === 1 ? "1 month" : `${item.months} months`}
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">{formatDate(item.previous_expiry)}</td>
                        <td className="px-5 py-4 text-xs font-semibold text-slate-700 dark:text-slate-200">{formatDate(item.new_expiry)}</td>
                        <td className="px-5 py-4 text-xs text-slate-500">{formatDateTime(item.created_at)}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                            <CheckCircle2 size={11} /> Recorded
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader
              icon={<UsersRound size={19} />}
              title="Usage & Access"
              subtitle="Your current usage and plan limits."
            />
            <div className="space-y-5 p-5">
              <UsageRow
                icon={<UsersRound size={16} />}
                label="Team seats"
                value={userLimit ? `${activeMembers} / ${userLimit} used` : `${activeMembers} active`}
                percent={seatPercent}
                detail={teamEnabled ? "Add team members to collaborate on TENH POS." : "Upgrade to a team plan to add staff."}
              />

              <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <MapPin size={15} className="text-blue-600" /> Store locations
                  </div>
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{activeLocations} active</span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-400">Branches and stock locations connected to this business.</p>
              </div>

              <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <UserPlus size={15} className="text-blue-600" /> Team access
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${teamEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {teamEnabled ? "Unlocked" : "Locked"}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-400">{freeChangeText}</p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader
              icon={<HelpCircle size={19} />}
              title="Need help with your subscription?"
              subtitle="Payment, renewal, and plan guidance."
            />
            <div className="space-y-4 p-5 text-xs leading-5 text-slate-500">
              <HelpLine icon={<Clock3 size={15} />} text="Manual payments are usually reviewed after your payment proof is submitted." />
              <HelpLine icon={<ReceiptText size={15} />} text="Each payment request keeps its review status and proof details." />
              <HelpLine icon={<CreditCard size={15} />} text="Billing activity stays available in your subscription history." />

              {business.role === "owner" ? (
                <Link
                  href="/dashboard/settings/subscription/plans"
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  {subscriptionAction} <ArrowRight size={14} />
                </Link>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${status === "active" || status === "trialing" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                {status === "active" || status === "trialing" ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Subscription status</p>
                <p className="mt-1 text-base font-extrabold text-slate-950 dark:text-white">{getStatusLabel(status)}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{formatDate(expiry)}{remainingDays !== null && remainingDays > 0 ? ` · ${remainingDays} days remaining` : ""}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-extrabold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{subtitle}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function OverviewItem({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0 text-slate-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-500">{label}</p>
        <p className="mt-0.5 text-sm font-extrabold text-slate-900 dark:text-white">{value}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function MiniDetail({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 shrink-0 text-slate-400">{icon}</div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p>
        <p className="mt-1 text-xs font-extrabold text-slate-800 dark:text-slate-100">{value}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function UsageRow({
  icon,
  label,
  value,
  percent,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  percent: number;
  detail: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
          <span className="text-blue-600">{icon}</span>
          {label}
        </div>
        <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

function HelpLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-blue-600">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function Notice({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone: "blue" | "amber";
  icon?: ReactNode;
}) {
  const classes = tone === "blue"
    ? "border-blue-200 bg-blue-50 text-blue-900"
    : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <section className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold ${classes}`}>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </section>
  );
}
