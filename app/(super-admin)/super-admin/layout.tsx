import type { ReactNode } from "react";
import { Search } from "lucide-react";

import SuperAdminSideRail from "@/components/super-admin/super-admin-side-rail";
import UpdateAlertBanner from "@/components/update-alert-banner";
import WorkspaceActivity from '@/components/ui/workspace-activity';
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppUrl, getTenantDashboardUrl } from "@/lib/tenancy/domain";

export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireSuperAdmin();
  // "My Business" is the admin's own Owner membership, not access to customer businesses.
  const myBusinessRead = supabaseAdmin
    .from("business_members")
    .select("businesses(slug)")
    .eq("user_id", admin.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  let pendingPayments = 0;
  let pendingSubscriptionPayments = 0;

  try {
    const { count, error } = await supabaseAdmin
      .from("business_change_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "payment_submitted");

    if (!error) {
      pendingPayments = count ?? 0;
    }
  } catch {
    // Keep Super Admin usable before the optional business-change payment
    // migration is installed. The badge will simply remain hidden.
    pendingPayments = 0;
  }


  try {
    const { count, error } = await supabaseAdmin
      .from("subscription_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["quote_requested", "payment_submitted"]);

    if (!error) {
      pendingSubscriptionPayments = count ?? 0;
    }
  } catch {
    pendingSubscriptionPayments = 0;
  }

  const { data: myMembership } = await myBusinessRead;
  const myBusiness = myMembership?.businesses as { slug?: string } | { slug?: string }[] | null | undefined;
  const mySlug = Array.isArray(myBusiness) ? myBusiness[0]?.slug : myBusiness?.slug;

  return (
    <div className="min-h-screen bg-slate-100">
      <WorkspaceActivity />
      <SuperAdminSideRail
        pendingPayments={pendingPayments}
        pendingSubscriptionPayments={pendingSubscriptionPayments}
      />
      <div className="min-h-screen lg:pl-16">
        <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
          <UpdateAlertBanner />
          {/* Full page load so no Super Admin client state carries into the business workspace. */}
          <div className="mb-3 flex justify-end">
            <a href={mySlug ? getTenantDashboardUrl(mySlug, "/dashboard") : getAppUrl("/get-started")} className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100">
              {mySlug ? "My Business" : "Create My Business"}
            </a>
          </div>
          <form action="/super-admin/businesses" method="GET" role="search" aria-label="Global Business Search" className="mb-5 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:ml-auto sm:max-w-xl">
            <Search aria-hidden size={18} className="ml-2 shrink-0 text-slate-400" />
            <label htmlFor="global-business-search" className="sr-only">Global Business Search</label>
            <input id="global-business-search" name="search" type="search" maxLength={160} placeholder="Search all businesses by name, code or slug…" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">Search</button>
          </form>
          {children}
        </div>
      </div>
    </div>
  );
}
