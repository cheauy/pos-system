import type { ReactNode } from "react";

import SuperAdminSideRail from "@/components/super-admin/super-admin-side-rail";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSuperAdmin();

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

  return (
    <div className="min-h-screen bg-slate-100">
      <SuperAdminSideRail
        pendingPayments={pendingPayments}
        pendingSubscriptionPayments={pendingSubscriptionPayments}
      />
      <div className="min-h-screen lg:pl-16">{children}</div>
    </div>
  );
}
