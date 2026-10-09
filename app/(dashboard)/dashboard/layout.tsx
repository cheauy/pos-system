import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import OnlineOrderListener from "@/components/online-order-listener";
import UpdateAlertBanner from "@/components/update-alert-banner";
import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { getAdminUrl } from "@/lib/tenancy/domain";
import { getBranchContext } from "@/lib/branches/context";
import { getEffectivePermissions } from "@/lib/auth/effective-permissions";
import PermissionRefresh from '@/components/permission-refresh';
import WorkspaceActivity from '@/components/ui/workspace-activity';
import PhoneTableLabels from '@/components/ui/phone-table-labels';
import { workspacePage } from '@/lib/navigation/page-title';
import WorkspaceBranchProvider from "./workspace-branch-provider";
import SidebarClient from "./sidebar-client";
import PosLockProvider from './pos-lock-provider';
import { posLockAllows, posLockCookie } from '@/lib/pos/navigation-lock';

const SUBSCRIPTION_PATH = "/dashboard/settings/subscription";
const LEGACY_SUBSCRIPTION_PLANS_PATH =
  "/dashboard/settings/subscription/plans";
const SUBSCRIPTION_PAYMENT_PATH =
  "/dashboard/settings/subscription/payment";
const ONBOARDING_PLANS_PATH =
  "/dashboard/settings/subscription?view=plans&onboarding=1";
const TRIAL_BLOCKED_PLANS_PATH =
  "/dashboard/settings/subscription?view=plans&onboarding=1&trial=unavailable";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // getCurrentBusinessForSubscription verifies the user with Supabase Auth and
  // redirects to login; a second getUser() here cost one more Auth round trip.
  // Subscription routes must be reachable before a new owner chooses between
  // paid checkout and the explicit 7-day free trial. Do not auto-start trial
  // merely because the dashboard layout rendered.
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-tenh-pathname") ?? "/dashboard";

  const trialChoicePending =
    business.subscriptionStatus === "trial_pending" ||
    business.subscriptionStatus === "trial_blocked";
  const isTrialChoiceRoute =
    pathname === SUBSCRIPTION_PATH ||
    pathname === LEGACY_SUBSCRIPTION_PLANS_PATH ||
    pathname.startsWith(`${SUBSCRIPTION_PAYMENT_PATH}/`);

  // Subscription state belongs to the business, not only the owner. Staff are
  // blocked too, but they should not be sent into owner billing controls.
  if (business.role !== "owner") {
    if (business.subscriptionStatus === "expired") {
      redirect("/business-disabled?reason=subscription_expired");
    }

    if (trialChoicePending) {
      redirect("/business-disabled?reason=owner_action_required");
    }
  }

  // A new business must explicitly choose paid checkout or the 7-day trial.
  // Keep general subscription/dashboard pages closed until that choice is made,
  // while still allowing payment checkout after a paid plan is selected.
  if (trialChoicePending && !isTrialChoiceRoute) {
    redirect(
      business.subscriptionStatus === "trial_blocked"
        ? TRIAL_BLOCKED_PLANS_PATH
        : ONBOARDING_PLANS_PATH,
    );
  }

  if (
    business.subscriptionLocked &&
    !trialChoicePending &&
    !pathname.startsWith(SUBSCRIPTION_PATH)
  ) {
    redirect(`${SUBSCRIPTION_PATH}?locked=1`);
  }

  if (business.subscriptionLocked) {
    // A Super Admin who owns this business still needs a visible way back during plan/trial choice.
    const userId = (business as { userId?: string }).userId;
    const { data: lockedProfile } = userId
      ? await (await createClient()).from("profiles").select("role").eq("id", userId).maybeSingle()
      : { data: null };
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <WorkspaceActivity />
        <main className="mx-auto min-h-screen w-full max-w-[1600px] p-4 sm:p-6">
          <UpdateAlertBanner />
          {lockedProfile?.role === "super_admin" && <div className="mb-3 flex justify-end"><a href={getAdminUrl("/super-admin")} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Super Admin</a></div>}
          {children}
        </main>
      </div>
    );
  }

  const supabase = await createClient();
  const permissionsRead = getEffectivePermissions(business.id, business.role);
  const branchRead = getBranchContext();
  const [branchContext, effectivePermissions, onlineScope, superAdmin] = await Promise.all([
    branchRead,
    permissionsRead,
    // Still gated on orders.view, but no longer waits for the branch read.
    permissionsRead.then((permissions) => permissions.includes("orders.view")
      ? supabase.rpc("tenh_receive_all_online_orders", { p_business: business.id }) : null),
    branchRead.then(({ userId }) => supabase.from("profiles").select("role").eq("id", userId).maybeSingle())
      .then(({ data }) => data?.role === "super_admin"),
  ]);
  const posLocked=effectivePermissions.includes('pos.access')&&(await cookies()).get(posLockCookie(business.id,branchContext.userId))?.value==='1';
  if(posLocked&&!posLockAllows(pathname))redirect('/dashboard/pos');
  // Phones hide page titles/summary cards on list pages; these overview pages keep them.
  const compactChrome = !workspacePage(pathname).back && !/^\/dashboard(\/(reports|staff-report|expenses))?$/.test(pathname);
  return (
    <div className="workspace-theme min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <WorkspaceActivity />
      <PosLockProvider key={`${business.id}:${branchContext.userId}`} businessId={business.id} userId={branchContext.userId} branchId={branchContext.branchId} initialLocked={posLocked}>
      <WorkspaceBranchProvider businessId={business.id} businessName={business.name} role={business.role} userId={branchContext.userId} branchId={branchContext.branchId} branches={branchContext.branches} superAdminHref={superAdmin ? getAdminUrl("/super-admin") : undefined}>
      <SidebarClient businessId={business.id} branchId={branchContext.branchId} effectivePermissions={effectivePermissions} />
      <PermissionRefresh businessId={business.id} userId={branchContext.userId} role={business.role} />
      {effectivePermissions.includes("orders.view") && <OnlineOrderListener businessId={business.id} branchId={branchContext.branchId} receiveAll={onlineScope?.data === true} />}

      <div className="md:pl-16">
        <main className="workspace-content min-w-0 max-w-full p-4 sm:p-6" data-mobile-chrome={compactChrome ? "compact" : undefined}><UpdateAlertBanner /><div className="min-w-0" key={branchContext.branchId}>{children}</div><PhoneTableLabels /></main>
      </div>
      </WorkspaceBranchProvider>
      </PosLockProvider>
    </div>
  );
}
