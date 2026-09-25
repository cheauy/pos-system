"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { saveSupportReport } from "@/lib/support/save-report";
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export async function createBugReport(_previous:{ok:boolean;message:string},form:FormData) {
  const user=await requireSuperAdmin();
  const businessId=String(form.get("businessId")??"");
  if(businessId&&!uuid.test(businessId))return {ok:false,message:"Choose a valid business."};
  if(businessId){const {data,error}=await supabaseAdmin.from("businesses").select("id").eq("id",businessId).maybeSingle();if(error||!data)return {ok:false,message:"The selected business is unavailable."};}
  const result=await saveSupportReport(form,user.id,businessId||null);
  if(!result.ok)return result;
  try { revalidatePath("/super-admin/support"); } catch { console.error("Bug report saved; support page refresh failed."); }
  return {ok:true,message:"Bug report saved."};
}
export async function updateBugStatus(id:string,status:string) {
  await requireSuperAdmin();
  if(!uuid.test(id)||!["open","in_progress","resolved"].includes(status))return {ok:false,message:"Choose a valid report and status."};
  const {data,error}=await supabaseAdmin.from("platform_support_reports").update({status,updated_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();
  if(error||!data)return {ok:false,message:"Unable to update this report. Refresh and try again."};
  try { revalidatePath("/super-admin/support"); revalidatePath("/dashboard/settings/support"); } catch { console.error("Bug status saved; support page refresh failed."); }
  return {ok:true,message:"Report status updated."};
}
