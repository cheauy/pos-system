import { redirect } from "next/navigation";
import { Mail, ShieldCheck, UserCheck, UserMinus, Users } from "lucide-react";

import { requireAnyPermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BusinessRole } from "@/lib/business/types";
import CreateBusinessUserForm from "@/components/settings/create-user-form";
import BackToSettingsLink from "@/components/settings/back-to-settings-link";
import BusinessUsersTable, { type BusinessUserRow } from "./business-users-table";

type Membership = { default_location_id: string | null; id: string; user_id: string; role: BusinessRole; is_active: boolean; disabled_reason: string | null; created_at: string };
type Profile = { id: string; full_name: string | null; email: string | null };
type AuthInfo = { email: string | null; lastSignInAt: string | null; pendingInvite: boolean };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const business = await requireAnyPermission(["users.view", "users.create", "users.create_limited"]);

  if (!["owner", "admin"].includes(business.role)) redirect("/dashboard");

  const { data: businessData, error: businessError } = await supabaseAdmin
    .from("businesses")
    .select("max_staff,subscription_status,subscription_plan_key,subscription_user_limit,subscription_team_enabled")
    .eq("id", business.id)
    .maybeSingle();
  if (businessError) throw new Error(businessError.message);

  const { data: membershipData, error: membershipError } = await supabaseAdmin
    .from("business_members")
    .select("id,user_id,role,is_active,disabled_reason,created_at,default_location_id")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true });
  if (membershipError) throw new Error(membershipError.message);

  const {data: branches, error: branchesError} = await supabaseAdmin.from("business_locations").select("id,name").eq("business_id",business.id).eq("is_active",true).order("is_default",{ascending:false}).order("name");
  if (branchesError) throw new Error("Unable to load branches.");
  const memberships = ((membershipData ?? []) as Membership[]).filter(
    (membership) => membership.disabled_reason !== "removed_by_owner",
  );
  const userIds = memberships.map((membership) => membership.user_id);

  let profiles: Profile[] = [];
  if (userIds.length > 0) {
    const { data: profileData, error: profileError } = await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", userIds);
    if (profileError) throw new Error(profileError.message);
    profiles = (profileData ?? []) as Profile[];
  }
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const authEntries = await Promise.all(
    memberships.map(async (membership) => {
      const { data, error: authError } = await supabaseAdmin.auth.admin.getUserById(membership.user_id);
      if (authError || !data.user) {
        return [membership.user_id, { email: null, lastSignInAt: null, pendingInvite: false } satisfies AuthInfo] as const;
      }
      const metadata = data.user.user_metadata ?? {};
      return [membership.user_id, {
        email: data.user.email ?? null,
        lastSignInAt: data.user.last_sign_in_at ?? null,
        pendingInvite: metadata.staff_invite_pending === true,
      } satisfies AuthInfo] as const;
    }),
  );
  const authMap = new Map(authEntries);

  const users: BusinessUserRow[] = memberships.map((membership) => {
    const profile = profileMap.get(membership.user_id);
    const auth = authMap.get(membership.user_id);
    return {
      id: membership.id,
      branchId: membership.default_location_id ?? branches?.[0]?.id ?? "",
      userId: membership.user_id,
      role: membership.role,
      isActive: membership.is_active,
      createdAt: membership.created_at,
      fullName: profile?.full_name ?? auth?.email?.split("@")[0] ?? "Unnamed user",
      email: profile?.email ?? auth?.email ?? "No email",
      lastSignInAt: auth?.lastSignInAt ?? null,
      pendingInvite: auth?.pendingInvite ?? false,
    };
  });

  const staffUsers = users.filter((user) => user.role !== "owner");
  const pendingInviteCount = staffUsers.filter((user) => user.pendingInvite).length;
  const activeStaffCount = staffUsers.filter((user) => user.isActive && !user.pendingInvite).length;
  const disabledStaffCount = staffUsers.filter((user) => !user.isActive).length;
  const usedStaffSlots = staffUsers.filter((user) => user.isActive).length;
  const subscriptionStatus = businessData?.subscription_status ?? "active";
  const trialOwnerOnly = ["trial_pending", "trialing", "trial_blocked"].includes(subscriptionStatus);
  const configuredUserLimit = Number(businessData?.subscription_user_limit ?? 0);
  const fallbackUserLimit = Math.max(1, Number(businessData?.max_staff ?? 0) + 1);
  const maxUsers = trialOwnerOnly
    ? 1
    : Number.isInteger(configuredUserLimit) && configuredUserLimit > 0
      ? configuredUserLimit
      : fallbackUserLimit;
  const teamEnabled = !trialOwnerOnly && (businessData?.subscription_team_enabled ?? maxUsers > 1);
  const maxStaff = teamEnabled ? Math.max(0, maxUsers - 1) : 0;
  const availableSlots = Math.max(0, maxStaff - usedStaffSlots);
  const canCreateTeamMember = teamEnabled && availableSlots > 0 && subscriptionStatus === "active";

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5">
      <BackToSettingsLink />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Users size={22} /></div>
          <div>
            <h1 className="text-3xl font-bold text-slate-950 dark:text-white">Users</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">Manage users for {business.name}</p>
          </div>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <ShieldCheck size={17} className="text-blue-600" />
          <span className="text-xs text-slate-500">Product mode:</span>
          <span className="text-xs font-bold capitalize text-slate-900 dark:text-white">{business.productMode}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<UserCheck size={19} />} iconTone="blue" label="Active staff" value={`${activeStaffCount} / ${maxStaff}`} description={`${availableSlots} slots available`} />
        <SummaryCard icon={<UserMinus size={19} />} iconTone="red" label="Disabled users" value={String(disabledStaffCount)} description="Accounts without access" />
        <SummaryCard icon={<Users size={19} />} iconTone="emerald" label="Total users" value={String(users.length)} description="Including business owner" />
        <SummaryCard icon={<Mail size={19} />} iconTone="orange" label="Pending invites" value={String(pendingInviteCount)} description="Waiting for password setup" />
      </div>

      {error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">⚠️ {error}</div>}

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        {canCreateTeamMember ? (
          <CreateBusinessUserForm currentRole={business.role} branches={branches ?? []} />
        ) : (
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-bold text-slate-950 dark:text-white">Team access</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {trialOwnerOnly
                ? "The 7-day free trial includes the owner only. Choose a paid team plan to create staff accounts."
                : !teamEnabled
                  ? "Your current subscription includes the owner only. Upgrade to Small Team, Growth Team or Custom Team to create staff accounts."
                  : "All user seats on this subscription are currently in use. Disable or remove a user, or upgrade your subscription to add another member."}
            </p>
          </section>
        )}
        <BusinessUsersTable branches={branches ?? []} users={users} loggedInRole={business.role} />
      </div>
    </main>
  );
}

function SummaryCard({ icon, iconTone, label, value, description }: { icon: React.ReactNode; iconTone: "blue" | "red" | "emerald" | "orange"; label: string; value: string; description: string }) {
  const tone = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
    red: "bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    orange: "bg-orange-50 text-orange-500 dark:bg-orange-950/40 dark:text-orange-300",
  }[iconTone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      </div>
    </div>
  );
}
