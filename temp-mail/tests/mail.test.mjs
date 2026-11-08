import test, { mock } from "node:test";
import assert from "node:assert/strict";
import DOMPurify from "isomorphic-dompurify";
import { MAIL_DOMAINS, normalizeEmail, EMAIL_TTL } from "../src/lib/config.ts";
import { addEmail, getEmailsByRecipient, getEmailById, clearInbox, extractOTP, messageId } from "../src/lib/store.ts";
import { parseWebhook, authenticWebhook, readPayload, MAX_EMAIL_BODY_BYTES } from "../src/lib/webhook.ts";
import { NextResponse } from "next/server.js";
import { pollingRetryAfter } from "../src/lib/rate-limit.ts";

const backgroundTasks = [];
mock.module("next/server.js", { namedExports: { NextResponse, after: (callback) => backgroundTasks.push(callback) } });
const { GET, POST, DELETE } = await import("../src/app/api/webhook/improvmx/route.ts");
const flushBackground = async () => { for (const task of backgroundTasks.splice(0)) await task(); };

const base = "https://temp-mail.tenh-pos.com/api/webhook/improvmx";
const recipient = "tester@loeuklabs.site";
const fixture = (overrides = {}) => ({
  recipient, sender: "verify@example.com", subject: "Your verification code is 849201", text: "Your code is 849201",
  html: "<p>Your code is <b>849201</b></p>", timestamp: Date.now(), otp_code: "849201", ...overrides,
});

test("OTP extraction prioritizes context and preserves leading zeroes", () => {
  for (const [subject, body, expected] of [
    ["Your verification code is 849201", "", "849201"],
    ["Order 12345678", "Your OTP: 004201", "004201"],
    ["Verify your email", "<p>code: <strong>1234</strong></p>", "1234"],
    ["PIN", "12345678 is your PIN", "12345678"],
    ["Welcome", "849201", "849201"],
    ["Code", "2026. Your code is 9326.", "9326"],
    ["លេខកូដ", "លេខកូដ៖ 008492", "008492"],
    ["", "Copyright 2024 2025 2026 2027", null],
    ["", '<style>.a { color: #123456 }</style><div style="color:#849201">Hello</div>', null],
    ["", "Color #1234 and #12345678; https://example.com/849201", null],
    ["", "123 123456789 ref849201 x1234y &#849201;", null],
    ["", "2026-11-07 and 07/11/2026", null],
    ["", "Port 8080, port: 5432, localhost:3000, 127.0.0.1:8080, [::1]:9000", null],
    ["OTP:1234", "Use port 8080", "1234"],
    ["", "example.com:5432; verification code: 009942", "009942"],
  ]) assert.equal(extractOTP(subject, body), expected, `${subject} / ${body}`);
});

test("only supported normalized addresses are accepted", () => {
  for (const domain of MAIL_DOMAINS) assert.equal(normalizeEmail(` Test.A-1@${domain.toUpperCase()} `), `test.a-1@${domain}`);
  for (const value of [null, 123, "a@evil.com", "a@loeuklabs.site@evil.com", "../@loeuklabs.site", "a..b@loeuklabs.site", ".a@loeuklabs.site", `${"a".repeat(65)}@loeuklabs.site`]) assert.equal(normalizeEmail(value), null);
});

test("real ImprovMX object addresses, envelope, multi-recipient and timestamps", () => {
  const data = parseWebhook({ to: [{ name: "Test", email: recipient }, { email: "second@tumnob.site" }], from: { name: "Example", email: "verify@example.com" }, subject: "OTP", text: "Code 849201", timestamp: Math.floor(Date.now() / 1000), "message-id": "provider-id" });
  assert.deepEqual(data.recipients, [recipient, "second@tumnob.site"]);
  assert.equal(data.sender, "verify@example.com");
  assert.ok(Math.abs(data.timestamp - Date.now()) < 2000);
  assert.deepEqual(parseWebhook({ ...fixture(), recipient: undefined, to: [{ email: "wrong@evil.com" }], headers: { "Delivered-To": `Test <${recipient}>` } }).recipients, [recipient]);
  assert.throws(() => parseWebhook({ to: { email: recipient }, from: [] }));
  assert.throws(() => parseWebhook({ ...fixture(), text: {} }));
  assert.throws(() => parseWebhook({ ...fixture(), timestamp: "not-a-date" }));
  assert.throws(() => parseWebhook({ ...fixture(), recipient: "a@evil.com" }));
});

test("memory store isolates recipients, deduplicates, expires, sorts, and deletes", async () => {
  globalThis.__emailStore.clear();
  const older = await addEmail(fixture({ id: "older", timestamp: Date.now() - 2000 }));
  const newer = await addEmail(fixture({ id: "newer" }));
  await addEmail(fixture({ id: "newer" }));
  await addEmail(fixture({ id: "other", recipient: "other@tumnob.site" }));
  globalThis.__emailStore.set("expired", fixture({ id: "expired", timestamp: Date.now() - EMAIL_TTL - 1 }));
  assert.deepEqual((await getEmailsByRecipient(recipient.toUpperCase())).map((item) => item.id), [newer.id, older.id]);
  assert.equal(await getEmailById("expired"), null);
  await clearInbox(recipient);
  assert.deepEqual(await getEmailsByRecipient(recipient), []);
  assert.equal((await getEmailsByRecipient("other@tumnob.site")).length, 1);
  assert.equal(messageId(recipient, "id"), messageId(recipient, "id"));
  assert.notEqual(messageId(recipient, "id"), messageId("other@tumnob.site", "id"));
});

test("webhook optional secret, legacy authentication, domain whitelist, size guards, and background deduplication", async () => {
  const previousSecret = process.env.IMPROVMX_WEBHOOK_SECRET;
  const previousNewSecret = process.env.WEBHOOK_SECRET;
  const previousVercel = process.env.VERCEL;
  delete process.env.VERCEL;
  delete process.env.IMPROVMX_WEBHOOK_SECRET;
  delete process.env.WEBHOOK_SECRET;
  try {
    const unsigned = new Request(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fixture()) });
    assert.equal((await POST(unsigned)).status, 200);
    await flushBackground();
    assert.ok(globalThis.__domainReceipts.get("loeuklabs.site") > 0);
    process.env.IMPROVMX_WEBHOOK_SECRET = "test-secret";
    assert.equal(authenticWebhook("no", "test-secret"), false);
    assert.equal(authenticWebhook("test-secret", "test-secret"), true);
    assert.equal((await POST(new Request(base, { method: "POST", body: "{}" }))).status, 401);
    const post = (body, contentType = "application/json") => POST(new Request(`${base}?token=test-secret`, { method: "POST", headers: { "content-type": contentType }, body }));
    assert.equal((await post("{}", "text/plain")).status, 415);
    assert.equal((await post("broken json")).status, 400);
    assert.equal((await post(JSON.stringify({ ...fixture(), recipient: "a@evil.com" }))).status, 403);
    assert.equal((await post(JSON.stringify({ ...fixture(), recipient: [recipient, "a@evil.com"] }))).status, 403);
    assert.equal((await post(JSON.stringify({ ...fixture(), recipient: "a@sub.loeuklabs.site" }))).status, 403);
    assert.equal((await post("x".repeat(1024 * 1024 + 1))).status, 200);
    await clearInbox(recipient);
    const payload = JSON.stringify({ ...fixture(), "message-id": "retry-safe" });
    const response = await post(payload);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal((await getEmailsByRecipient(recipient)).length, 0, "response must not wait for storage");
    await flushBackground();
    await post(payload);
    await flushBackground();
    assert.equal((await getEmailsByRecipient(recipient)).length, 1);
    assert.match(response.headers.get("cache-control"), /no-store/);
    process.env.WEBHOOK_SECRET = "new-secret";
    assert.equal((await post(payload)).status, 401, "new secret overrides legacy setting");
    for (const options of [{ url: `${base}?secret=new-secret` }, { headers: { "x-webhook-secret": "new-secret" } }]) {
      assert.equal((await POST(new Request(options.url ?? base, { method: "POST", headers: { "content-type": "application/json", ...options.headers }, body: payload }))).status, 200);
      await flushBackground();
    }
  } finally {
    if (previousNewSecret === undefined) delete process.env.WEBHOOK_SECRET; else process.env.WEBHOOK_SECRET = previousNewSecret;
    if (previousSecret === undefined) delete process.env.IMPROVMX_WEBHOOK_SECRET; else process.env.IMPROVMX_WEBHOOK_SECRET = previousSecret;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
  }
});

test("removed demo parameter cannot create messages; delete validates origin", async () => {
  await clearInbox(recipient);
  const response = await GET(new Request(`${base}?email=${recipient}&demo=true`));
  const { emails } = await response.json();
  assert.deepEqual(emails, []);
  assert.deepEqual(await getEmailsByRecipient(recipient), []);
  assert.equal((await GET(new Request(`${base}?email=a@evil.com`))).status, 400);
  await addEmail(fixture());
  assert.equal((await DELETE(new Request(`${base}?email=${recipient}`, { method: "DELETE", headers: { origin: "https://evil.com" } }))).status, 403);
  assert.equal((await getEmailsByRecipient(recipient)).length, 1);
  assert.equal((await DELETE(new Request(`${base}?email=${recipient}`, { method: "DELETE", headers: { origin: "https://temp-mail.tenh-pos.com" } }))).status, 200);
  assert.equal((await getEmailsByRecipient(recipient)).length, 0);
});

test("stream body limit works without Content-Length", async () => {
  await assert.rejects(readPayload(new Request(base, { method: "POST", body: "a".repeat(1024 * 1024 + 1) })), RangeError);
});

test("heavy bodies truncate by bytes and attachment fields are discarded", () => {
  const parsed = parseWebhook({ ...fixture(), text: `Code 004201 ${"a".repeat(250_000)}`, html: "ក".repeat(100_000), attachments: [{ data: "unused" }] });
  assert.equal(Buffer.byteLength(parsed.text), MAX_EMAIL_BODY_BYTES);
  assert.ok(Buffer.byteLength(parsed.html) <= MAX_EMAIL_BODY_BYTES);
  assert.ok(!parsed.html.endsWith("�"));
  assert.equal(parsed.attachments, undefined);
  assert.equal(extractOTP(parsed.subject, parsed.text), "849201");
});

test("inbox limits evict oldest timestamps globally and per recipient, and expire after one hour", async () => {
  globalThis.__emailStore.clear();
  const now = Date.now();
  for (let i = 0; i < 21; i++) await addEmail(fixture({ id: `cap-${i}`, timestamp: now - 1000 + i }));
  assert.equal((await getEmailsByRecipient(recipient)).length, 20);
  assert.equal(await getEmailById("cap-0"), null);
  globalThis.__emailStore.clear();
  for (let i = 0; i < 2000; i++) globalThis.__emailStore.set(`global-${i}`, fixture({ id: `global-${i}`, recipient: `user${i}@loeuklabs.site`, timestamp: now - (i === 1999 ? 3000 : 1000) }));
  await addEmail(fixture({ id: "new-global" }));
  assert.equal(globalThis.__emailStore.size, 2000);
  assert.equal(await getEmailById("global-1999"), null, "evicts oldest timestamp, not insertion order");
  globalThis.__emailStore.set("expired", fixture({ id: "expired", timestamp: now - EMAIL_TTL }));
  assert.equal(await getEmailById("expired"), null);
  globalThis.__emailStore.clear();
});

test("GET and DELETE share a 30/minute IP limit, reset, and isolate IPs", async () => {
  globalThis.__inboxRateLimits.clear();
  const req = (ip = "192.0.2.10") => new Request(`${base}?email=${recipient}`, { headers: { "x-forwarded-for": ip } });
  for (let i = 0; i < 29; i++) assert.equal(pollingRetryAfter(req()), 0);
  assert.equal((await GET(req())).status, 200);
  const limited = await DELETE(req());
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(pollingRetryAfter(req("192.0.2.11")), 0);
  assert.equal(pollingRetryAfter(req(), Date.now() + 60_001), 0);
  globalThis.__inboxRateLimits.clear();
});

test("Redis errors fail without silently falling back to separate instance memory", async () => {
  const previousFetch = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ result: 1 }); };
    await addEmail(fixture({ id: "redis-id" }));
    assert.equal(calls[0][0], "EVAL");
    assert.match(calls[0][1], /EXPIRE/);
    assert.match(calls[0][1], /ZREMRANGEBYRANK/);
    assert.equal(calls[0][4], "tenh:temp-mail:message:redis-id");
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(addEmail(fixture()), /unavailable/);
    await assert.rejects(getEmailsByRecipient(recipient), /unavailable/);
  } finally {
    globalThis.fetch = previousFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("sanitizer strips scripts, attributes, remote tracking images, and links", () => {
  const html = DOMPurify.sanitize('<script>alert(1)</script><img src="https://evil.com/track"><a href="javascript:alert(1)">Code</a><p onclick="alert(1)" style="color:red">849201</p>', { ALLOWED_TAGS: ["p", "strong"], ALLOWED_ATTR: [] });
  assert.equal(html, "Code<p>849201</p>");
});
