import { MAIL_DOMAINS } from "./config.ts";
import { deliveryReady, getDomainReceipts } from "./store.ts";

export type DnsState = "pass" | "warning" | "fail" | "unknown";
export interface DnsCheck { state: DnsState; records: string[] }
export interface DomainStatus {
  domain: string;
  status: "ready" | "attention" | "unavailable" | "unknown";
  mx: DnsCheck;
  spf: DnsCheck;
  dmarc: DnsCheck;
  lastReceivedAt: number | null;
}
export interface DomainStatusReport {
  checkedAt: number;
  refreshAfter: number;
  backendReady: boolean;
  domains: DomainStatus[];
}

declare global {
  var __domainDnsCache: { checkedAt: number; domains: Omit<DomainStatus, "lastReceivedAt">[] } | undefined;
  var __domainDnsRequest: Promise<NonNullable<typeof globalThis.__domainDnsCache>> | undefined;
}

async function lookup(name: string, type: "MX" | "TXT"): Promise<string[] | null> {
  let result: string[] | null = null;
  // A second resolver can see newly added records while the first caches NXDOMAIN.
  for (const resolver of ["https://dns.google/resolve", "https://cloudflare-dns.com/dns-query"]) {
    try {
      const response = await fetch(`${resolver}?name=${encodeURIComponent(name)}&type=${type}`, {
        cache: "no-store", headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) continue;
      const data = await response.json() as { Status?: number; Answer?: { type: number; data: string }[] };
      if (data.Status !== 0 && data.Status !== 3) continue;
      result = (data.Answer ?? []).filter((item) => item.type === (type === "MX" ? 15 : 16))
        .map((item) => item.data.replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
      if (result.length) return result;
    } catch { /* Try the other resolver before marking a lookup unavailable. */ }
  }
  return result;
}

function checks(mx: string[] | null, txt: string[] | null, policy: string[] | null) {
  const targets = mx?.map((item) => item.trim().split(/\s+/).at(-1)?.toLowerCase().replace(/\.$/, ""));
  const spf = txt?.filter((item) => /^v=spf1(?:\s|$)/i.test(item)) ?? [];
  const dmarc = policy?.filter((item) => /^v=DMARC1(?:\s*;|$)/i.test(item)) ?? [];
  const mxCheck: DnsCheck = { records: mx ?? [], state: mx === null ? "unknown" : !mx.length ? "fail"
    : targets?.length === 2 && targets.includes("mx1.improvmx.com") && targets.includes("mx2.improvmx.com") ? "pass" : "warning" };
  const spfCheck: DnsCheck = { records: spf, state: txt === null ? "unknown" : spf.length > 1 ? "fail"
    : spf.length === 1 && /(?:^|\s)include:spf\.improvmx\.com(?:\s|$)/i.test(spf[0]) ? "pass" : "warning" };
  const dmarcCheck: DnsCheck = { records: dmarc, state: policy === null ? "unknown" : dmarc.length > 1 ? "fail"
    : dmarc.length === 1 && /;\s*p=(?:none|quarantine|reject)\s*(?:;|$)/i.test(dmarc[0]) ? "pass" : "warning" };
  const all = [mxCheck, spfCheck, dmarcCheck];
  const status: DomainStatus["status"] = mxCheck.state === "fail" ? "unavailable" : all.some((item) => item.state === "unknown") ? "unknown"
    : all.every((item) => item.state === "pass") ? "ready" : "attention";
  return { mx: mxCheck, spf: spfCheck, dmarc: dmarcCheck, status };
}

async function dnsReport() {
  if (globalThis.__domainDnsCache && Date.now() - globalThis.__domainDnsCache.checkedAt < 60_000) return globalThis.__domainDnsCache;
  // Coalesce concurrent visitors; DNS is checked once per minute per running instance.
  globalThis.__domainDnsRequest ??= (async () => {
    const domains = await Promise.all(MAIL_DOMAINS.map(async (domain) => {
      const [mx, txt, dmarc] = await Promise.all([lookup(domain, "MX"), lookup(domain, "TXT"), lookup(`_dmarc.${domain}`, "TXT")]);
      return { domain, ...checks(mx, txt, dmarc) };
    }));
    return globalThis.__domainDnsCache = { checkedAt: Date.now(), domains };
  })();
  try { return await globalThis.__domainDnsRequest; }
  finally { globalThis.__domainDnsRequest = undefined; }
}

export async function getDomainStatus(): Promise<DomainStatusReport> {
  const [dns, receipts] = await Promise.all([dnsReport(), getDomainReceipts().catch(() => null)]);
  const backendReady = deliveryReady() && receipts !== null;
  return {
    checkedAt: dns.checkedAt, refreshAfter: dns.checkedAt + 60_000, backendReady,
    domains: dns.domains.map((item, index) => ({ ...item, status: backendReady ? item.status : "unavailable", lastReceivedAt: receipts?.[index] ?? null })),
  };
}
