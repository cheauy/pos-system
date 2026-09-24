import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Monitoring failures must never interrupt subscription processing.
export async function recordSubscriptionJob(startedAt: string, status: "running" | "succeeded" | "failed") {
  try {
    const table = supabaseAdmin.from("system_job_health");
    const query = status === "running"
      ? table.upsert({ job_name: "subscription-purge", status, started_at: startedAt, finished_at: null })
      : table.update({ status, finished_at: new Date().toISOString() })
        .eq("job_name", "subscription-purge").eq("started_at", startedAt);
    const { error } = await query.abortSignal(AbortSignal.timeout(3000));
    if (error) console.warn("Background job health could not be recorded.");
  } catch {
    console.warn("Background job health could not be recorded.");
  }
}
