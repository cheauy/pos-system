import { createClient } from "@/lib/supabase/branch-server";
import { getBranchContext } from "@/lib/branches/context";
import AlertRecipientsForm from "./alert-recipients-form";
import NotificationPreferences from "./notification-preferences";

export default async function AlertRecipients({businessId}: {businessId:string}) {
  const {branchId,userId,branches}=await getBranchContext();
  const supabase=await createClient();
  const [roles,preferences]=await Promise.all([
    supabase.from("branch_notification_role_settings").select("notification_type,target_roles").eq("business_id",businessId).eq("location_id",branchId),
    supabase.from("business_notification_preferences").select("sound_enabled,browser_enabled").eq("business_id",businessId).eq("user_id",userId).maybeSingle(),
  ]);
  if(roles.error||preferences.error)return <p role="alert" className="mt-5 text-red-600">Unable to load notification settings. Please refresh.</p>;
  const settings=Object.fromEntries((roles.data??[]).map(row=>[row.notification_type,row.target_roles]));
  return <div className="mt-5 space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">Who receives each alert?</h2>
      <p className="mt-1 text-sm text-slate-500">Choose recipients for {branches.find(branch=>branch.id===branchId)?.name??"this branch"}. Changes apply after saving.</p>
      <AlertRecipientsForm key={branchId} branchId={branchId} settings={settings}/>
    </section>
    <NotificationPreferences soundEnabled={preferences.data?.sound_enabled??true} browserEnabled={preferences.data?.browser_enabled??false}/>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">Automatic account notices</h2>
      <dl className="mt-4 divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <div className="flex flex-wrap justify-between gap-2 py-3"><dt>Subscription quotes and payment reviews</dt><dd className="text-slate-500">Owner only</dd></div>
        <div className="flex flex-wrap justify-between gap-2 py-3"><dt>Business change credit payment reviews</dt><dd className="text-slate-500">Owner only</dd></div>
        <div className="flex flex-wrap justify-between gap-2 py-3"><dt>System updates and announcements</dt><dd className="text-slate-500">Audience selected by Super Admin</dd></div>
      </dl>
    </section>
  </div>;
}
