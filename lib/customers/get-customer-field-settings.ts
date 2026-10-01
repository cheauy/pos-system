import "server-only";

import { createClient } from "@/lib/supabase/branch-server";

export type CustomerFieldSettings = {
  emailEnabled: boolean;
  birthdayEnabled: boolean;
  genderEnabled: boolean;
};

export async function getCustomerFieldSettings(
  businessId: string,
): Promise<CustomerFieldSettings> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("branch_customer_settings")
    .select("email_enabled,birthday_enabled,gender_enabled")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    return {
      emailEnabled: true,
      birthdayEnabled: true,
      genderEnabled: false,
    };
  }

  return {
    emailEnabled: data?.email_enabled ?? true,
    birthdayEnabled: data?.birthday_enabled ?? true,
    genderEnabled: data?.gender_enabled ?? false,
  };
}
