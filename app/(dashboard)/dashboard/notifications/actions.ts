"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { assertOperatingBranch } from "@/lib/branches/context";
import { businessAlerts, notificationRoles } from "@/lib/notifications/settings";

export type AlertSaveState = { success: boolean; message: string };

export async function saveNotificationRoleSettings(_previous: AlertSaveState, formData: FormData): Promise<AlertSaveState> {
 try {
  const business = await requirePermission("business.update");
  if (business.role !== 'owner') throw new Error('Only the owner can change alert recipients.');
  const branchId = String(formData.get('branchId') ?? '');
  await assertOperatingBranch(branchId);
  const supabase = await createClient();
  const rows = businessAlerts.map(({type}) => {
    const roles = notificationRoles.filter((role) => formData.get(`${type}:${role}`) === "on");
    return {
      business_id: business.id,
      location_id: branchId,
      notification_type: type,
      target_roles: roles,
      updated_at: new Date().toISOString(),
    };
  });
  const { error } = await supabase.from("branch_notification_role_settings").upsert(rows, { onConflict: "business_id,location_id,notification_type" });
  if (error) throw new Error('Unable to save alert recipients. Please try again.');
  const refresh = await supabase.rpc("refresh_business_notifications", { p_business_id: business.id });
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/notifications");
  return {success:true,message:refresh.error?'Settings saved. Alerts will update on the next refresh.':'Alert recipients saved.'};
 } catch(error) {
  return {success:false,message:error instanceof Error?error.message:'Unable to save alert recipients.'};
 }
}

export async function saveNotificationPreferences(input: {sound:boolean;browser:boolean}): Promise<AlertSaveState> {
 try {
  if(typeof input.sound!=='boolean'||typeof input.browser!=='boolean')throw new Error('Invalid notification settings.');
  const business=await getCurrentBusiness();
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error('Please sign in again.');
  const {error}=await supabase.from('business_notification_preferences').upsert({business_id:business.id,user_id:user.id,sound_enabled:input.sound,browser_enabled:input.browser,updated_at:new Date().toISOString()},{onConflict:'business_id,user_id'});
  if(error)throw new Error('Unable to save notification preferences. Please try again.');
  revalidatePath('/dashboard/settings/notifications');
  return {success:true,message:'Notification preferences saved.'};
 } catch(error) {
  return {success:false,message:error instanceof Error?error.message:'Unable to save notification preferences.'};
 }
}
