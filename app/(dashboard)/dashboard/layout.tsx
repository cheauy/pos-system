import { redirect } from "next/navigation";

import OnlineOrderListener from "@/components/online-order-listener";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import SidebarClient from "./sidebar-client";

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

  // The dashboard is canonical on app.tenh-pos.com. Tenant subdomains are
  // public storefronts only; proxy.ts enforces the host boundary.
  const business = await getCurrentBusiness();

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
