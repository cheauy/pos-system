"use server";

import { assertOperatingBranch } from "@/lib/branches/context";
import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

export async function updateCustomerFieldSettings(
  formData: FormData,
) {
  const business = await requirePermission("business.update");
  if(formData.has("branchId"))await assertOperatingBranch(String(formData.get("branchId")));
  const supabase = await createClient();

  const emailEnabled = formData.get("emailEnabled") === "on";
  const birthdayEnabled = formData.get("birthdayEnabled") === "on";

  const { error } = await supabase
    .from("branch_customer_settings")
    .upsert(
      {
        business_id: business.id,
        email_enabled: emailEnabled,
        birthday_enabled: birthdayEnabled,
        ...(formData.has("genderSettingPresent")?{gender_enabled:formData.get("genderEnabled")==="on"}:{}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id,location_id" },
    );

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "update",
    entityType: "business",
    entityId: business.id,
    description: "Updated customer field settings",
    metadata: {
      emailEnabled,
      birthdayEnabled,
      ...(formData.has("genderSettingPresent") ? { genderEnabled: formData.get("genderEnabled") === "on" } : {}),
    },
  });

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/settings/customers");
  revalidatePath("/dashboard/settings/system");
  revalidatePath("/dashboard/pos");
}
