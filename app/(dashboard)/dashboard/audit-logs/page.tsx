import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuditLogsTable from "./audit-log-table";

export type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;

  profiles: {
    full_name: string | null;
  } | null;
};

export default async function AuditLogsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["owner", "admin"].includes(profile.role)
  ) {
    redirect("/dashboard");
  }

  const { data, error } = await supabase
    .from("audit_logs")
    .select(`
      id,
      action,
      entity_type,
      entity_id,
      description,
      metadata,
      created_at,
      profiles:profiles!audit_logs_user_id_fkey (
        full_name
      )
    `)
    .order("created_at", {
      ascending: false,
    })
    .limit(100);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
        <h2 className="font-semibold">
          Failed to load audit logs
        </h2>

        <p className="mt-2 text-sm">
          {error.message}
        </p>

        <p className="mt-1 text-xs">
          Error code: {error.code}
        </p>
      </div>
    );
  }

  const logs = (data ?? []) as unknown as AuditLog[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Audit Logs
        </h1>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Review important activity performed in the POS system.
        </p>
      </div>

      <AuditLogsTable logs={logs} />
    </div>
  );
}