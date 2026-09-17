import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CustomerFieldSettings = {
  emailEnabled: boolean;
  birthdayEnabled: boolean;
};

export async function getCustomerFieldSettings(
  businessId: string,
): Promise<CustomerFieldSettings> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_customer_settings")
    .select("email_enabled,birthday_enabled")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    return {
      emailEnabled: true,
      birthdayEnabled: true,
    };
  }

  return {
    emailEnabled: data?.email_enabled ?? true,
    birthdayEnabled: data?.birthday_enabled ?? true,
  };
}
