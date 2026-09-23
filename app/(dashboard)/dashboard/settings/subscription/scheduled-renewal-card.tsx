import { CalendarClock, ShieldCheck } from "lucide-react";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSubscriptionPlanLabel } from "@/lib/subscriptions/plans";
import type {
  RenewalBranchOption,
  RenewalMemberOption,
} from "./renewal-selection-dialog";
import ScheduledRenewalSelection from "./scheduled-renewal-selection";

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  is_active: boolean;
  disabled_reason: string | null;
  team_password_required: boolean | null;
  team_name: string | null;
};

const formatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Phnom_Penh",
});

export default async function ScheduledRenewalCard({ businessId }: { businessId: string }) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from("subscription_orders")
    .select("id,plan_key,requested_user_limit,requested_branch_limit,effective_at,keep_member_ids,keep_branch_ids")
    .eq("business_id", businessId)
    .eq("pricing_version", 5)
    .eq("order_kind", "renewal")
    .eq("status", "approved")
    .is("activated_at", null)
    .gt("effective_at", new Date().toISOString())
    .order("effective_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orderError) throw new Error(`Unable to load the next subscription plan: ${orderError.message}`);
  if (!order) return null;

  const [{ data: members, error: memberError }, { data: branches, error: branchError }] = await Promise.all([
    supabaseAdmin
      .from("business_members")
      .select("id,user_id,role,created_at,is_active,disabled_reason,team_password_required,team_name")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("business_locations")
      .select("id,name,is_default,is_active,created_at,plan_disable_pending")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .eq("plan_disable_pending", false)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);
  if (memberError) throw new Error(`Unable to load team usage: ${memberError.message}`);
  if (branchError) throw new Error(`Unable to load branch usage: ${branchError.message}`);

  const seatRows = ((members ?? []) as MemberRow[]).filter(
    (member) =>
      member.disabled_reason !== "removed_by_owner" &&
      (member.is_active ||
        (Boolean(member.team_password_required) && member.disabled_reason === "password_setup")),
  );
  const userIds = [...new Set(seatRows.map((member) => member.user_id))];
  const profileNames = new Map<string, { name: string; email: string }>();
  if (userIds.length) {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", userIds);
    if (profileError) throw new Error(`Unable to load team names: ${profileError.message}`);
    for (const profile of profiles ?? []) {
      profileNames.set(profile.id, {
        name: profile.full_name || "Team member",
        email: profile.email || "",
      });
    }
  }

  const memberOptions: RenewalMemberOption[] = seatRows.map((member) => {
    const profile = profileNames.get(member.user_id);
    return {
      id: member.id,
      name: member.team_name?.trim() || profile?.name || "Team member",
      email: profile?.email || "",
      role: member.role,
      createdAt: member.created_at,
    };
  });
  const branchOptions: RenewalBranchOption[] = (branches ?? []).map((branch) => ({
    id: branch.id,
    name: branch.name,
    isDefault: Boolean(branch.is_default),
    createdAt: branch.created_at,
  }));

  return (
    <section className="rounded-3xl border border-blue-200 bg-blue-50/80 p-5 shadow-sm dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm dark:bg-slate-900">
          <CalendarClock size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-extrabold text-blue-950 dark:text-blue-100">Next plan payment approved</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck size={12} /> Data protected
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-blue-900/80 dark:text-blue-200/80">
            Your current paid access stays unchanged until {formatter.format(new Date(order.effective_at))}. Then {getSubscriptionPlanLabel(order.plan_key)} becomes active with {order.requested_user_limit} {order.requested_user_limit === 1 ? "user" : "users"} and {order.requested_branch_limit} {order.requested_branch_limit === 1 ? "branch" : "branches"}. Excess users and branches are disabled, never deleted.
          </p>
          <ScheduledRenewalSelection
            orderId={order.id}
            userLimit={order.requested_user_limit}
            branchLimit={order.requested_branch_limit}
            members={memberOptions}
            branches={branchOptions}
            initialMemberIds={order.keep_member_ids ?? null}
            initialBranchIds={order.keep_branch_ids ?? null}
          />
        </div>
      </div>
    </section>
  );
}
