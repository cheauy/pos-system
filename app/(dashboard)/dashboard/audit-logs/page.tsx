import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/require-permission";
import AuditLogsTable from "./audit-log-table";

export type AuditLog = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  profiles: {
    full_name: string | null;
  } | null;
};

export type AuditBranch = {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean | null;
};

export default async function AuditLogsPage() {
  // Keep the existing tenant-safe permission guard. Do not add a second
  // profiles.role check here: business membership is the source of truth.
  const business = await requirePermission("audit_logs.view");
  const supabase = await createClient();

  const [logsResult, branchesResult] = await Promise.all([
    supabase
      .from("audit_logs")
      .select(`
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        business_id,
        description,
        metadata,
        ip_address,
        user_agent,
        created_at,
        profiles:profiles!audit_logs_user_id_fkey (
          full_name
        )
      `)
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("business_locations")
      .select("id,name,code,is_default")
      .eq("business_id", business.id)
      .order("is_default", { ascending: false })
      .order("name"),
  ]);

  if (logsResult.error) {
    return (
      <main className="mx-auto w-full max-w-[1600px] pb-8">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <h1 className="text-lg font-semibold">Failed to load audit logs</h1>
          <p className="mt-2 text-sm">{logsResult.error.message}</p>
          <p className="mt-1 text-xs">Error code: {logsResult.error.code}</p>
        </section>
      </main>
    );
  }

  return (
    <AuditLogsTable
      logs={(logsResult.data ?? []) as unknown as AuditLog[]}
      branches={(branchesResult.data ?? []) as unknown as AuditBranch[]}
      branchLoadError={branchesResult.error?.message ?? null}
    />
  );
}
