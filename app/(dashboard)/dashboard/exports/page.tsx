import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import ExportClient from "./export-client";

export default async function ExportsPage() {
  const business = await requirePermission("exports.manage");
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("data_transfer_jobs")
    .select("id,direction,entity,format,mode,filename,row_count,status,error_message,created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
      <ExportClient productMode={business.productMode} isOwner={business.role === "owner"} recentJobs={(jobs ?? []) as Array<{ id: string; direction: string; entity: string; format: string; mode: string | null; filename: string | null; row_count: number; status: string; error_message: string | null; created_at: string }>} />
    </main>
  );
}
