import { createClient } from "@/lib/supabase/branch-server";
import { getBranchContext } from "@/lib/branches/context";
import AlertRecipientsForm from "./alert-recipients-form";

export default async function AlertRecipients({businessId}: {businessId:string}) {
  const {branchId,userId,branches}=await getBranchContext();
  const supabase=await createClient();
  const [roles,preferences]=await Promise.all([
    supabase.from("branch_notification_role_settings").select("notification_type,target_roles").eq("business_id",businessId).eq("location_id",branchId),
    supabase.from("business_notification_preferences").select("sound_enabled,browser_enabled").eq("business_id",businessId).eq("user_id",userId).maybeSingle(),
  ]);
  if(roles.error||preferences.error)return <p role="alert" className="mt-5 text-red-600">Unable to load notification settings. Please refresh.</p>;
  const settings=Object.fromEntries((roles.data??[]).map(row=>[row.notification_type,row.target_roles]));
  return <AlertRecipientsForm key={`${businessId}:${branchId}`} businessId={businessId} branchId={branchId} branchName={branches.find(branch=>branch.id===branchId)?.name??"this branch"} settings={settings} soundEnabled={preferences.data?.sound_enabled??true} browserEnabled={preferences.data?.browser_enabled??false}/>;
}
