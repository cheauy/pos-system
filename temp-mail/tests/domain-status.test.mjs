import test from "node:test";
import assert from "node:assert/strict";
import { MAIL_DOMAINS } from "../src/lib/config.ts";
import { getDomainStatus } from "../src/lib/domain-status.ts";
import { getDomainReceipts, recordDomainReceipt } from "../src/lib/store.ts";
import { GET } from "../src/app/api/domains/status/route.ts";

function answer(url) {
  const params = new URL(url).searchParams;
  const type = params.get("type");
  const name = params.get("name");
  return Response.json({ Status: 0, Answer: type === "MX"
    ? [{ type: 15, data: "10 mx1.improvmx.com." }, { type: 15, data: "20 mx2.improvmx.com." }]
    : [{ type: 16, data: name.startsWith("_dmarc.") ? '"v=DMARC1; p=none;"' : '"v=spf1 include:spf.improvmx.com ~all"' }] });
}

function reset() {
  globalThis.__domainDnsCache = undefined;
  globalThis.__domainDnsRequest = undefined;
  globalThis.__domainReceipts = new Map();
}

test("a second resolver verifies new records while the first caches NXDOMAIN", async () => {
  reset();
  const original = globalThis.fetch;
  let fallbacks = 0;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.Accept, "application/dns-json");
      if (new URL(url).hostname === "dns.google" && new URL(url).searchParams.get("name").startsWith("_dmarc.")) return Response.json({ Status: 3 });
      if (new URL(url).hostname === "cloudflare-dns.com") fallbacks++;
      return answer(url);
    };
    const report = await getDomainStatus();
    assert.equal(fallbacks, 5);
    assert.ok(report.domains.every(item => item.status === "ready" && item.dmarc.records[0] === "v=DMARC1; p=none;"));
  } finally { globalThis.fetch = original; reset(); }
});

test("live checks use only the whitelist, coalesce/cache DNS, and refresh private-free receipt metadata", async () => {
  reset();
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => { calls.push(url); assert.equal(options.cache, "no-store"); return answer(url); };
    await recordDomainReceipt(MAIL_DOMAINS[0]);
    const [one, two] = await Promise.all([getDomainStatus(), getDomainStatus()]);
    assert.equal(calls.length, 15);
    assert.equal(one.checkedAt, two.checkedAt);
    assert.equal(one.backendReady, true);
    assert.ok(one.domains.every((item) => item.status === "ready"));
    assert.ok(one.domains[0].lastReceivedAt > 0);
    assert.equal(one.domains[1].lastReceivedAt, null);
    await recordDomainReceipt(MAIL_DOMAINS[1]);
    const cached = await getDomainStatus();
    assert.equal(calls.length, 15);
    assert.ok(cached.domains[1].lastReceivedAt > 0, "receipts refresh independently of DNS cache");
    assert.deepEqual(cached.domains.map((item) => item.domain), [...MAIL_DOMAINS]);
    assert.equal(cached.refreshAfter - cached.checkedAt, 60_000);
    assert.ok(!JSON.stringify(cached).includes("recipient"));
    await assert.rejects(recordDomainReceipt("evil.com"), /Unsupported/);
    globalThis.__domainDnsCache.checkedAt -= 60_001;
    await getDomainStatus();
    assert.equal(calls.length, 30);
  } finally { globalThis.fetch = original; reset(); }
});

test("missing, invalid, and failed DNS checks are distinct and never report unblocked acceptance", async () => {
  reset();
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const params = new URL(url).searchParams;
      const name = params.get("name");
      const type = params.get("type");
      if (name === MAIL_DOMAINS[0] && type === "MX") return Response.json({ Status: 3 });
      if (name === MAIL_DOMAINS[1] && type === "TXT") return Response.json({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 include:spf.improvmx.com ~all"' }, { type: 16, data: '"v=spf1 -all"' }] });
      if (name === `_dmarc.${MAIL_DOMAINS[2]}`) return Response.json({ Status: 3 });
      if (name === MAIL_DOMAINS[3] && type === "MX") return new Response("unavailable", { status: 503 });
      if (name === MAIL_DOMAINS[4]) throw new Error("timeout");
      return answer(url);
    };
    const report = await getDomainStatus();
    assert.equal(report.domains[0].status, "unavailable");
    assert.equal(report.domains[0].mx.state, "fail");
    assert.equal(report.domains[1].spf.state, "fail");
    assert.equal(report.domains[1].status, "attention");
    assert.equal(report.domains[2].dmarc.state, "warning");
    assert.equal(report.domains[3].mx.state, "unknown");
    assert.equal(report.domains[4].status, "unknown");
    assert.ok(!JSON.stringify(report).includes("unblocked"));
  } finally { globalThis.fetch = original; reset(); }
});

test("status API disables caching, limits polling, and shows unavailable storage on Vercel", async () => {
  reset();
  const original = globalThis.fetch;
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    globalThis.fetch = async (url) => answer(url);
    const request = () => new Request("https://temp-mail.tenh-pos.com/api/domains/status", { headers: { "x-vercel-forwarded-for": "192.0.2.93" } });
    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const data = await response.json();
    assert.equal(data.backendReady, false);
    assert.ok(data.domains.every((item) => item.status === "unavailable"));
    for (let i = 0; i < 29; i++) await GET(request());
    assert.equal((await GET(request())).status, 429);
    globalThis.__domainReceipts.set(MAIL_DOMAINS[0], Date.now() - 8 * 86400000);
    assert.equal((await getDomainReceipts())[0], null);
  } finally {
    globalThis.fetch = original;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    reset();
  }
});
