import { headers } from "next/headers";
import { redirect } from "next/navigation";

import OnlineOrderListener from "@/components/online-order-listener";
import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { getBranchContext } from "@/lib/branches/context";
import { getEffectivePermissions } from "@/lib/auth/effective-permissions";
import PermissionRefresh from '@/components/permission-refresh';
import WorkspaceBranchProvider from "./workspace-branch-provider";
import SidebarClient from "./sidebar-client";

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <main className="mx-auto min-h-screen w-full max-w-[1600px] p-4 sm:p-6">
          {children}
        </main>
      </div>
    );
  }

  const [branchContext, effectivePermissions] = await Promise.all([
    getBranchContext(),
    getEffectivePermissions(business.id, business.role),
  ]);
  return (
    <div className="workspace-theme min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <WorkspaceBranchProvider businessId={business.id} userId={branchContext.userId} branchId={branchContext.branchId} branches={branchContext.branches}>
      <SidebarClient businessId={business.id} branchId={branchContext.branchId} effectivePermissions={effectivePermissions} />
      <PermissionRefresh businessId={business.id} userId={branchContext.userId} role={business.role} />
      <OnlineOrderListener businessId={business.id} branchId={branchContext.branchId} />

      <div className="lg:pl-16">
        <main className="p-4 sm:p-6"><div key={branchContext.branchId}>{children}</div></main>
      </div>
      </WorkspaceBranchProvider>
    </div>
  );
}
