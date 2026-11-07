"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Mail, RefreshCw } from "lucide-react";
import { runTempMailHealth, type TempMailReport } from "./actions";

const labels = { pass: "Verified", warning: "Needs review", fail: "Failed", unknown: "Unavailable", ready: "Verified", attention: "Needs review", unavailable: "Down" };

export default function TempHealthClient() {
  const [report, setReport] = useState<TempMailReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const running = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try { setReport(await runTempMailHealth()); setError(false); }
    catch { setError(true); }
    finally { running.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const visibleRefresh = () => { if (!document.hidden) void refresh(); };
    const timer = setInterval(visibleRefresh, 60_000);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", visibleRefresh); };
  }, [refresh]);

  return <main className="space-y-6 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-3 text-3xl font-bold"><Mail className="text-blue-600" />Temp</h1><p className="mt-2 text-sm text-slate-500">Live Domain Deliverability Status · DNS, inbox storage and recent delivery receipts.</p></div>
      <button disabled={busy} onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"><RefreshCw size={17} className={busy ? "animate-spin" : ""} />{busy ? "Checking…" : "Refresh status"}</button>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">Unable to refresh. Previous results below may be stale. Refresh your session and try again.</p>}
    <div aria-live="polite" className="flex flex-wrap gap-4 text-sm text-slate-500"><span>{report ? `Last DNS check: ${new Date(report.checkedAt).toLocaleString()}` : "Waiting for live checks…"}</span><span>Refreshes every minute</span>{report && <span className={error ? "text-slate-500" : report.backendReady ? "text-emerald-700" : "text-red-700"}>Inbox storage: {error ? "Not verified" : report.backendReady ? "Verified" : "Down"}</span>}</div>
    <section className="grid gap-4 xl:grid-cols-2" aria-busy={busy}>{report?.domains.map(item => <article key={item.domain} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-all text-base font-bold">{item.domain}</h2><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${error ? "bg-slate-100 text-slate-600" : item.status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{!error && item.status === "ready" && <CheckCircle2 size={14} />}{error ? "Not verified" : labels[item.status]}</span></div>
      <dl className="mt-4 space-y-4">{(["mx", "spf", "dmarc"] as const).map(key => <div key={key}><dt className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold"><span>{key.toUpperCase()} <span className="text-xs font-normal text-slate-400">{key === "dmarc" ? `_dmarc.${item.domain}` : item.domain}</span></span><span className={error ? "text-slate-500" : item[key].state === "pass" ? "text-emerald-700" : "text-amber-700"}>{error ? "Not verified" : labels[item[key].state]}</span></dt><dd className="mt-1 space-y-1 rounded-lg bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-600">{item[key].records.length ? item[key].records.map(record => <p className="break-all" key={record}>{record}</p>) : "No record found or lookup unavailable"}</dd></div>)}</dl>
      <p className="mt-4 text-xs text-slate-500">Last delivery receipt: {item.lastReceivedAt ? new Date(item.lastReceivedAt).toLocaleString() : "No receipt in the past seven days"}</p>
    </article>)}</section>
    <p className="text-xs leading-6 text-slate-500">DNS checks confirm MX, SPF and DMARC configuration. Receipts confirm mail reached the app; checks do not send test emails. Each website controls its own email acceptance rules. DMARC p=none monitors authentication without rejecting messages.</p>
  </main>;
}
