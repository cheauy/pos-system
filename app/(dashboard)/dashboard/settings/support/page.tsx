import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import CustomerSupport from "./support-client";

export default async function CustomerSupportPage() {
  const business = await getCurrentBusiness();
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const reports = await supabaseAdmin.from("platform_support_reports").select("id,title,description,status,created_at").eq("business_id", business.id).eq("created_by", user.id).order("created_at", { ascending: false }).limit(50);
  return <CustomerSupport reports={reports.data ?? []} loadError={Boolean(reports.error)} />;
}
