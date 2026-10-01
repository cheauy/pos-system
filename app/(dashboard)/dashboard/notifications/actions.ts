"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { assertOperatingBranch } from "@/lib/branches/context";
import { businessAlerts } from "@/lib/notifications/settings";

export type NotificationSettingsInput = {businessId:string;branchId:string;enabled:Record<string,boolean>;sound:boolean;browser:boolean};
export type AlertSaveState = {success:boolean;message:string;alertsSaved?:boolean;preferencesSaved?:boolean};

export async function saveNotificationSettings(input:NotificationSettingsInput):Promise<AlertSaveState> {
 let alertsSaved=false,preferencesSaved=false;
 try {
  const business=await requirePermission("business.update");
  if(business.role!=="owner")throw new Error("Only the owner can change notification settings.");
  if(input?.businessId!==business.id)throw new Error("The active business changed. Reload settings before saving.");
  if(typeof input.sound!=="boolean"||typeof input.browser!=="boolean"||!input.enabled||businessAlerts.some(({type})=>typeof input.enabled[type]!=="boolean"))throw new Error("Review your notification settings.");
  await assertOperatingBranch(input.branchId);
  const supabase=await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)throw new Error("Please sign in again.");
  // Recipients come from the role policy, never from client-provided role names.
  const rows=businessAlerts.map(({type,roles})=>({business_id:business.id,location_id:input.branchId,notification_type:type,target_roles:input.enabled[type]?roles:[],updated_at:new Date().toISOString()}));
  const alerts=await supabase.from("branch_notification_role_settings").upsert(rows,{onConflict:"business_id,location_id,notification_type"});
  if(alerts.error)throw new Error("Unable to save alerts. Please try again.");
  alertsSaved=true;
  const preferences=await supabase.from("business_notification_preferences").upsert({business_id:business.id,user_id:user.id,sound_enabled:input.sound,browser_enabled:input.browser,updated_at:new Date().toISOString()},{onConflict:"business_id,user_id"});
  if(preferences.error)throw new Error("Alerts saved, but sound and browser preferences were not saved. Please retry Save.");
  preferencesSaved=true;
  let refreshFailed=false;
  try {
    const refresh=await supabase.rpc("refresh_business_notifications",{p_business_id:business.id});
    refreshFailed=Boolean(refresh.error);
    revalidatePath("/dashboard/notifications");
    revalidatePath("/dashboard/settings/notifications");
  } catch {refreshFailed=true;}
  return {success:true,alertsSaved,preferencesSaved,message:refreshFailed?"Notification settings saved. Alerts will update on the next refresh.":"Notification settings saved."};
 } catch(error) {
  return {success:false,alertsSaved,preferencesSaved,message:alertsSaved&&!preferencesSaved&&!(error instanceof Error&&error.message.startsWith("Alerts saved"))?"Alerts saved, but preferences could not be confirmed. Please retry Save.":error instanceof Error?error.message:"Unable to save notification settings. Please try again."};
 }
}
