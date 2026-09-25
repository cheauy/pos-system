import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import SupportClient from "./support-client";
export default async function SupportPage() {
  await requireSuperAdmin();
  const [reports,businesses]=await Promise.all([
    supabaseAdmin.from("platform_support_reports").select("id,title,description,reason,image_path,page_path,priority,status,created_at,business_id,created_by").order("created_at",{ascending:false}).limit(100),
    readAllRows<{id:string;name:string}>((from,to)=>supabaseAdmin.from("businesses").select("id,name").order("name").order("id").range(from,to)),
  ]);
  const reporterIds=[...new Set((reports.data??[]).map(r=>r.created_by).filter((id):id is string=>Boolean(id)))];
  const reporters=reporterIds.length?await supabaseAdmin.from("profiles").select("id,full_name,email").in("id",reporterIds):{data:[],error:null};
  const reporterMap=new Map((reporters.data??[]).map(p=>[p.id,p]));
  const rows=(reports.data??[]).map(r=>({...r,reporter:reporterMap.get(r.created_by)?.full_name||reporterMap.get(r.created_by)?.email||"Reporter unavailable"}));
  return <SupportClient reports={rows} businesses={businesses.data??[]} loadError={Boolean(reports.error||businesses.error||reporters.error)}/>;
}
