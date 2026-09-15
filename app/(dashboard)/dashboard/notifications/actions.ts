"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = [
  "new_order",
  "khqr_pending",
  "low_stock",
  "purchase_order",
  "stock_transfer",
  "register_variance",
  "credit_overdue",
  "scheduled_order",
] as const;
const allowedRoles = ["owner", "admin", "manager", "cashier"] as const;

export async function saveNotificationRoleSettings(formData: FormData) {
  const business = await requirePermission("business.update");
  const supabase = await createClient();
  const rows = allowedTypes.map((type) => {
    const roles = allowedRoles.filter((role) => formData.get(`${type}:${role}`) === "on");
    return {
      business_id: business.id,
      notification_type: type,
      target_roles: roles.length ? roles : ["owner"],
      updated_at: new Date().toISOString(),
    };
  });
  const { error } = await supabase.from("business_notification_role_settings").upsert(rows, { onConflict: "business_id,notification_type" });
  if (error) throw new Error(error.message);
  await supabase.rpc("refresh_business_notifications", { p_business_id: business.id });
  revalidatePath("/dashboard/notifications");
}
