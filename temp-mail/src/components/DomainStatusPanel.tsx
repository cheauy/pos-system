"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleHelp, RefreshCw, Server, ShieldCheck, TriangleAlert } from "lucide-react";
import { MAIL_DOMAINS } from "../lib/config.ts";
import type { DomainStatusReport } from "../lib/domain-status.ts";
import type { Language } from "../lib/i18n.ts";

const text = {
  en: {
    title: "Live Domain Deliverability Status",
    refresh: "Check domains", checking: "Checking…", ready: "Verified", attention: "Not verified", unavailable: "Down", unknown: "Not verified",
    select: "Use domain",
  },
  km: {
    title: "ស្ថានភាពទទួលអ៊ីមែលដូមែនផ្ទាល់",
    refresh: "ពិនិត្យដូមែន", checking: "កំពុងពិនិត្យ…", ready: "បានផ្ទៀងផ្ទាត់", attention: "មិនទាន់ផ្ទៀងផ្ទាត់", unavailable: "មិនអាចប្រើបាន", unknown: "មិនទាន់ផ្ទៀងផ្ទាត់",
    select: "ប្រើដូមែន",
  },
};

function DomainStatusPanel({ language, selectedDomain, onSelect }: { language: Language; selectedDomain: string; onSelect: (domain: string) => void }) {
  const [report, setReport] = useState<DomainStatusReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const t = text[language];
  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const response = await fetch("/api/domains/status", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
      if (!response.ok) throw new Error("Status unavailable");
      const data = await response.json() as DomainStatusReport;
      if (!Number.isFinite(data.checkedAt) || Math.abs(Date.now() - data.checkedAt) > 120_000) throw new Error("Stale status");
      if (!controller.signal.aborted) { setReport(data); setError(false); }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const visibleRefresh = () => { if (!document.hidden) void refresh(); };
    const timer = setInterval(visibleRefresh, 60_000);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", visibleRefresh); request.current?.abort(); request.current = null; };
  }, [refresh]);

  return <section className="domain-status-panel" id="domain-status" aria-labelledby="domain-status-title" aria-busy={busy}>
    <div className="domain-status-heading"><h2 id="domain-status-title"><Server size={19} /><span>{t.title}</span></h2>
      <button className="action-button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} className={busy ? "spin" : ""} />{busy ? t.checking : t.refresh}</button>
    </div>
    <div className="domain-status-grid">{MAIL_DOMAINS.map((domain) => {
      const item = report?.domains.find((entry) => entry.domain === domain);
      const status = error ? "unknown" : item?.status ?? "unknown";
      const selected = selectedDomain === domain;
      return <article key={domain} className={`domain-status-card${selected ? " selected" : ""}`}>
        <div className={`domain-status-badge ${status}`}>{status === "ready" ? <ShieldCheck size={12} /> : status === "unknown" ? <CircleHelp size={12} /> : <TriangleAlert size={12} />}{!item && busy ? t.checking : t[status]}</div>
        <button className="domain-choice" aria-label={`${t.select}: ${domain}`} aria-pressed={selected} onClick={() => onSelect(domain)}><span>@{domain}</span>{selected && <Check size={14} />}</button>
      </article>;
    })}</div>
  </section>;
}

export default memo(DomainStatusPanel);
