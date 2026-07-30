import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function expireDueBusinesses() {
  const { data, error } = await supabaseAdmin.rpc(
    "expire_due_businesses",
  );

  if (error) {
    throw new Error(
      `Unable to expire businesses: ${error.message}`,
    );
  }

  return {
    expiredCount:
      typeof data === "number" ? data : 0,
  };
}