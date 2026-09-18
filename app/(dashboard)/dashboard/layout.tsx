import { redirect } from "next/navigation";

import LogoutButton from "@/components/logout-button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { getAppUrl } from "@/lib/tenancy/domain";
import { getRequestTenantSlug } from "@/lib/tenancy/request-tenant";
import SidebarClient from "./sidebar-client";
import OnlineOrderListener from "@/components/online-order-listener";
import NotificationBell from "@/components/notification-bell";
import GlobalSearchBox from "@/components/global-search-box";

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

  // Tenant subdomains are public storefronts only. proxy.ts normally
  // canonicalizes this before the layout runs; keep this guard as a
  // server-side backstop so a tenant hostname can never render admin UI.
  const tenantSlug = await getRequestTenantSlug();

  if (tenantSlug) {
    redirect(getAppUrl("/dashboard"));
  }

  const business = await getCurrentBusiness();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <SidebarClient />
      <OnlineOrderListener businessId={business.id} />

      <div className="lg:pl-64">
        <header className="flex h-20 items-center gap-4 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0 shrink-0">
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">{business.name}</p>
            <p className="max-w-48 truncate font-medium text-slate-900 dark:text-slate-100">{user.email}</p>
          </div>
          <div className="flex min-w-0 flex-1 justify-center"><GlobalSearchBox /></div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell businessId={business.id} />
            <LogoutButton />
          </div>
        </header>

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
