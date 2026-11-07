"use server";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

type DnsCheck = { state: "pass" | "warning" | "fail" | "unknown"; records: string[] };
export type TempMailReport = {
  checkedAt: number;
  backendReady: boolean;
  domains: { domain: string; status: "ready" | "attention" | "unavailable" | "unknown"; mx: DnsCheck; spf: DnsCheck; dmarc: DnsCheck; lastReceivedAt: number | null }[];
};

const domains = ["loeuklabs.site", "mekhalatech.site", "tumnob.site", "helenbl.site", "honey-wellaerospace.site"];

export async function runTempMailHealth(): Promise<TempMailReport> {
  await requireSuperAdmin();
  const response = await fetch("https://temp-mail.tenh-pos.com/api/domains/status", {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Temp Mail health unavailable");
  const report = await response.json() as TempMailReport;
  if (!report || !Number.isFinite(report.checkedAt) || Math.abs(Date.now() - report.checkedAt) > 120_000 || typeof report.backendReady !== "boolean" || !Array.isArray(report.domains) || report.domains.length !== domains.length || new Set(report.domains.map(item => item?.domain)).size !== domains.length) throw new Error("Invalid Temp Mail health report");
  return {
    checkedAt: report.checkedAt,
    backendReady: report.backendReady,
    domains: report.domains.map(item => {
      if (!item || !domains.includes(item.domain) || !["ready", "attention", "unavailable", "unknown"].includes(item.status) || (item.lastReceivedAt !== null && (!Number.isFinite(item.lastReceivedAt) || item.lastReceivedAt <= 0))) throw new Error("Invalid domain health");
      const checks = {} as Pick<typeof item, "mx" | "spf" | "dmarc">;
      for (const key of ["mx", "spf", "dmarc"] as const) {
        const check = item[key];
        if (!check || !["pass", "warning", "fail", "unknown"].includes(check.state) || !Array.isArray(check.records) || check.records.length > 20 || check.records.some(record => typeof record !== "string" || record.length > 2048)) throw new Error("Invalid DNS check");
        checks[key] = { state: check.state, records: check.records };
      }
      return { domain: item.domain, status: item.status, lastReceivedAt: item.lastReceivedAt, ...checks };
    }),
  };
}
