import { headers } from "next/headers";
import { redirect } from "next/navigation";

import OnlineOrderListener from "@/components/online-order-listener";
import {
  getCurrentBusinessForSubscription,
} from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import {
  getTenantDashboardUrl,
  usesSharedSubdomainCookies,
} from "@/lib/tenancy/domain";
import { getRequestTenantSlug } from "@/lib/tenancy/request-tenant";
import SidebarClient from "./sidebar-client";

const SUBSCRIPTION_PATH = "/dashboard/settings/subscription";

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

  const business =
    await getCurrentBusinessForSubscription();
  const tenantSlug = await getRequestTenantSlug();
  const requestHeaders = await headers();
  const pathname =
    requestHeaders.get("x-tenh-pathname") ??
    "/dashboard";

  if (!tenantSlug && usesSharedSubdomainCookies()) {
    redirect(
      getTenantDashboardUrl(
        business.slug,
        business.subscriptionLocked
          ? SUBSCRIPTION_PATH
          : "/dashboard",
      ),
    );
  }

  if (
    business.subscriptionLocked &&
    !pathname.startsWith(SUBSCRIPTION_PATH)
  ) {
    redirect(`${SUBSCRIPTION_PATH}?locked=1`);
  }

  if (business.subscriptionLocked) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <main className="mx-auto min-h-screen w-full max-w-[1500px] p-4 sm:p-6">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <SidebarClient businessId={business.id} />
      <OnlineOrderListener businessId={business.id} />

      <div className="lg:pl-16">
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
