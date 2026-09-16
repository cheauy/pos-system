import Link from "next/link";
import { ArrowLeft, CircleHelp } from "lucide-react";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/settings" className="mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <ArrowLeft size={16} /> Back to settings
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Backup & Export</h1>
          <p className="mt-1 text-slate-500">Export or import your business data. Download portable CSV or JSON files for use in other systems.</p>
        </div>
        <Link href="/dashboard/settings" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <CircleHelp size={17} /> View Help
        </Link>
      </div>

      <ExportClient recentJobs={(jobs ?? []) as Array<{ id: string; direction: string; entity: string; format: string; mode: string | null; filename: string | null; row_count: number; status: string; error_message: string | null; created_at: string }>} />
    </main>
  );
}
