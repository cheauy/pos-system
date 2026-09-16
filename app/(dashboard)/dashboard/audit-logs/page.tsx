import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import AuditLogsTable from "./audit-log-table";
import { requirePermission } from "@/lib/auth/require-permission";

export type AuditLog = {
  id: string;
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

export default async function AuditLogsPage() {
  // audit_logs.view is intentionally granted only to business owners.
  // requirePermission resolves the current tenant through business_members,
  // so do not repeat an incompatible role/business check against profiles.
  const business = await requirePermission("audit_logs.view");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select(`
      id,
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
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
      <div>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600 dark:text-slate-400"
        >
          <ArrowLeft size={16} />
          Back to settings
        </Link>
      </div>

      <section>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
          Audit Logs
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Review important activity performed in the POS system.
        </p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <h2 className="font-semibold">Failed to load audit logs</h2>
          <p className="mt-2 text-sm">{error.message}</p>
          <p className="mt-1 text-xs">Error code: {error.code}</p>
        </div>
      ) : (
        <AuditLogsTable logs={(data ?? []) as unknown as AuditLog[]} />
      )}
    </main>
  );
}
