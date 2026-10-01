import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { getBranchContext } from "@/lib/branches/context";
import { createClient } from "@/lib/supabase/branch-server";
import RegisterSetting from "../register-setting";

import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { getCustomerFieldSettings } from "@/lib/customers/get-customer-field-settings";
import AppearanceForm from "./appearance-form";

export default async function SystemDisplaySettingsPage() {
  const business = await getCurrentBusiness();
  const canManageFields = await businessHasPermission(business,"business.update");
  const context = business.role === "owner" || canManageFields ? await getBranchContext() : null;
  const customerFields = canManageFields ? await getCustomerFieldSettings(business.id) : null;
  const registerResult = business.role === "owner" && context?.branchId ? await (await createClient()).from("branch_pos_settings").select("require_open_register").eq("business_id", business.id).eq("location_id", context.branchId).maybeSingle() : null;
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
      <section>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to settings
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          System & Display
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage POS behavior and display preferences. Display preferences are saved on this device.
        </p>
      </section>

      {business.role === "owner" && context?.branchId && (registerResult?.error || !registerResult?.data ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Unable to load the POS register setting. Refresh and try again.</p> : <RegisterSetting key={`register:${context.branchId}`} businessId={business.id} branchId={context.branchId} branchName={context.branches.find(branch => branch.id === context.branchId)?.name ?? "Active branch"} required={registerResult.data.require_open_register !== false} />)}
      <AppearanceForm key={`display:${business.id}:${context?.branchId ?? "device"}`} customerFields={customerFields} branchId={context?.branchId} />
    </main>
  );
}
