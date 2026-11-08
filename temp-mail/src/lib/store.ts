import { createHash, randomUUID } from "node:crypto";
import { EMAIL_TTL, MAIL_DOMAINS, normalizeEmail, type EmailMessage } from "./config.ts";

export type { EmailMessage } from "./config.ts";

declare global {
  var __emailStore: Map<string, EmailMessage> | undefined;
  var __emailCleanup: ReturnType<typeof setInterval> | undefined;
  var __domainReceipts: Map<string, number> | undefined;
}

const memory = globalThis.__emailStore ??= new Map<string, EmailMessage>();

function cleanup() {
  const cutoff = Date.now() - EMAIL_TTL;
  for (const [id, email] of memory) if (email.timestamp <= cutoff) memory.delete(id);
}

if (!globalThis.__emailCleanup) {
  globalThis.__emailCleanup = setInterval(cleanup, 60_000);
  globalThis.__emailCleanup.unref();
}

export function extractOTP(subject: string, body: string): string | null {
  const clean = `${subject}\n${body}`
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+|#[a-f\d]{3,8}\b|&(?:#\d+|#x[a-f\d]+|\w+);/gi, " ")
    .replace(/\b(?:[a-z\d-]+\.)+[a-z\d-]+:\d{1,5}\b|\blocalhost:\d{1,5}\b|\[[a-f\d:]+\]:\d{1,5}\b|\b(?:port|ports)\s*(?:number\s*)?[:=#-]?\s*\d{1,5}\b/gi, " ")
    .replace(/\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\b/g, " ");
  const code = "(?<![\\w#])([0-9]{4,8})(?![\\w])";
  const keyword = "(?:code|otp|verif(?:y|ication)|pin|passcode|password|លេខកូដ)";
  const candidates = [
    new RegExp(`${keyword}[^\\d\\n]{0,50}${code}`, "gi"),
    new RegExp(`${code}[^\\d\\n]{0,35}${keyword}`, "gi"),
    new RegExp(code, "g"),
  ];
  for (const pattern of candidates) {
    for (const match of clean.matchAll(pattern)) {
      const value = match[1];
      if (!/^(?:19|20)\d{2}$/.test(value)) return value;
    }
  }
  return null;
}

function redisSettings() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function deliveryReady(): boolean {
  return !process.env.VERCEL || Boolean(redisSettings());
}

async function redis<T>(command: (string | number)[]): Promise<T> {
  const settings = redisSettings();
  if (!settings) throw new Error("Shared email storage is not configured");
  const response = await fetch(settings.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Email storage unavailable");
  const result = await response.json() as { result: T; error?: string };
  if (result.error) throw new Error("Email storage command failed");
  return result.result;
}

const inboxKey = (email: string) => `tenh:temp-mail:inbox:${email}`;
const messageKey = (id: string) => `tenh:temp-mail:message:${id}`;
const receiptKey = (domain: string) => `tenh:temp-mail:last-received:${domain}`;

export async function recordDomainReceipt(domain: string): Promise<void> {
  if (!MAIL_DOMAINS.some((item) => item === domain)) throw new Error("Unsupported domain");
  const timestamp = Date.now();
  if (redisSettings()) {
    await redis(["SET", receiptKey(domain), timestamp, "EX", 604800]);
  } else {
    (globalThis.__domainReceipts ??= new Map()).set(domain, timestamp);
  }
}

export async function getDomainReceipts(): Promise<(number | null)[]> {
  const values = redisSettings()
    ? await redis<(string | null)[]>(["MGET", ...MAIL_DOMAINS.map(receiptKey)])
    : MAIL_DOMAINS.map((domain) => globalThis.__domainReceipts?.get(domain) ?? null);
  return values.map((value) => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > Date.now() - 7 * 86400000 && timestamp <= Date.now() ? timestamp : null;
  });
}

export async function addEmail(input: Omit<EmailMessage, "id"> & { id?: string }): Promise<EmailMessage> {
  const recipient = normalizeEmail(input.recipient);
  if (!recipient) throw new Error("Unsupported recipient");
  const email = { ...input, recipient, id: input.id ?? randomUUID(), timestamp: Math.min(input.timestamp, Date.now()) };
  if (!Number.isFinite(email.timestamp)) throw new Error("Invalid timestamp");
  const ttl = Math.ceil((email.timestamp + EMAIL_TTL - Date.now()) / 1000);
  if (ttl <= 0) return email;
  if (redisSettings()) {
    await redis(["EVAL", `
      if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
      redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
      redis.call('ZADD', KEYS[1], ARGV[3], KEYS[2])
      redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[4])
      local overflow = redis.call('ZRANGE', KEYS[1], 0, -21)
      for _, key in ipairs(overflow) do redis.call('DEL', key) end
      redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -21)
      redis.call('EXPIRE', KEYS[1], 3600)
      return 1`, 2, inboxKey(recipient), messageKey(email.id), JSON.stringify(email), ttl, email.timestamp, Date.now() - EMAIL_TTL]);
  } else {
    // shortcut: memory is one-process storage; use Redis before deploying across workers or serverless instances.
    cleanup();
    if (!memory.has(email.id)) memory.set(email.id, email);
    const inbox = [...memory.values()].filter((item) => item.recipient === recipient);
    for (const stale of inbox.sort((a, b) => b.timestamp - a.timestamp).slice(20)) memory.delete(stale.id);
    if (memory.size > 2000) {
      const oldest = [...memory.values()].sort((a, b) => a.timestamp - b.timestamp).slice(0, memory.size - 2000);
      for (const stale of oldest) memory.delete(stale.id);
    }
  }
  return email;
}

export async function getEmailsByRecipient(value: string): Promise<EmailMessage[]> {
  const email = normalizeEmail(value);
  if (!email) return [];
  if (redisSettings()) {
    const keys = await redis<string[]>(["ZREVRANGEBYSCORE", inboxKey(email), "+inf", Date.now() - EMAIL_TTL, "LIMIT", 0, 20]);
    if (!keys.length) return [];
    const messages = await redis<(string | null)[]>(["MGET", ...keys]);
    return messages.filter((item): item is string => item !== null).map((item) => JSON.parse(item) as EmailMessage)
      .filter((item) => item.timestamp > Date.now() - EMAIL_TTL && item.recipient === email);
  }
  cleanup();
  return [...memory.values()].filter((item) => item.recipient === email).sort((a, b) => b.timestamp - a.timestamp);
}

export async function getEmailById(id: string): Promise<EmailMessage | null> {
  if (redisSettings()) {
    const value = await redis<string | null>(["GET", messageKey(id)]);
    const email = value ? JSON.parse(value) as EmailMessage : null;
    return email && email.timestamp > Date.now() - EMAIL_TTL ? email : null;
  }
  cleanup();
  return memory.get(id) ?? null;
}

export async function clearInbox(value: string): Promise<void> {
  const email = normalizeEmail(value);
  if (!email) return;
  if (redisSettings()) {
    await redis(["EVAL", `
      local keys = redis.call('ZRANGE', KEYS[1], 0, -1)
      for _, key in ipairs(keys) do redis.call('DEL', key) end
      return redis.call('DEL', KEYS[1])`, 1, inboxKey(email)]);
    return;
  }
  for (const [id, message] of memory) if (message.recipient === email) memory.delete(id);
}

export function messageId(recipient: string, source: string): string {
  return createHash("sha256").update(`${recipient}\n${source}`).digest("hex");
}
