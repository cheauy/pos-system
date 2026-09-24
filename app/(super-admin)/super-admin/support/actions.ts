"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export async function createBugReport(_previous:{ok:boolean;message:string},form:FormData) {
  const user=await requireSuperAdmin();
  const title=String(form.get("title")??"").trim(),description=String(form.get("description")??"").trim(),priority=String(form.get("priority")??"normal"),businessId=String(form.get("businessId")??"");
  const path=String(form.get("pagePath")??"").trim().split(/[?#]/)[0];
  if(title.length<3||title.length>160||description.length<10||description.length>6000||!["low","normal","urgent"].includes(priority)||path.length>500||(path&&!/^\/(?!\/)/.test(path))||(businessId&&!uuid.test(businessId)))return {ok:false,message:"Check the title, description, priority and page path."};
  if(businessId){const {data,error}=await supabaseAdmin.from("businesses").select("id").eq("id",businessId).maybeSingle();if(error||!data)return {ok:false,message:"The selected business is unavailable."};}
  const {error}=await supabaseAdmin.from("platform_support_reports").insert({created_by:user.id,business_id:businessId||null,title,description,priority,page_path:path});
  if(error)return {ok:false,message:"Unable to save the report. Your details have been kept; please try again."};
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
