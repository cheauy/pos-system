import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const API_KEY_PREFIX = "tpos_live_";
export const WEBHOOK_SECRET_PREFIX = "whsec_";

export const ALLOWED_WEBHOOK_EVENTS = [
  "product.created",
  "product.updated",
  "product.deleted",
  "inventory.updated",
] as const;

export type WebhookEventType = (typeof ALLOWED_WEBHOOK_EVENTS)[number];

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey.trim(), "utf8").digest("hex");
}

export function generateApiKey(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const randomHex = randomBytes(24).toString("hex");
  const rawKey = `${API_KEY_PREFIX}${randomHex}`;
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 18),
    keyHash: hashApiKey(rawKey),
  };
}

export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function maskSecret(value: string | null | undefined): string {
  const clean = (value ?? "").trim();
  if (!clean) return "";
  if (clean.length <= 12) return "••••••••••••";
  return `${clean.slice(0, 10)}••••••••${clean.slice(-4)}`;
}

export function extractApiKeyFromHeaders(headers: Pick<Headers, "get">): string | null {
  const authHeader = headers.get("authorization")?.trim() ?? "";
  if (/^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token) return token;
  }

  const headerKey =
    headers.get("x-api-key")?.trim() ??
    headers.get("x-tenh-api-key")?.trim() ??
    "";

  return headerKey || null;
}

export function isPlausibleApiKey(rawKey: string | null | undefined): rawKey is string {
  if (typeof rawKey !== "string") return false;
  const clean = rawKey.trim();
  return (
    clean.length >= 24 &&
    clean.length <= 160 &&
    clean.startsWith(API_KEY_PREFIX) &&
    /^tpos_live_[a-zA-Z0-9_-]+$/.test(clean)
  );
}

export function signWebhookPayload(
  secret: string,
  timestampSec: number,
  rawBody: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestampSec}.${rawBody}`, "utf8")
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature({
  secret,
  signatureHeader,
  timestampHeader,
  rawBody,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
}: {
  secret: string;
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  rawBody: string;
  nowSec?: number;
  toleranceSec?: number;
}): boolean {
  if (!secret || !signatureHeader || !timestampHeader) return false;
  const ts = Number(timestampHeader.trim());
  if (!Number.isSafeInteger(ts) || Math.abs(nowSec - ts) > toleranceSec) {
    return false;
  }
  const expected = signWebhookPayload(secret, ts, rawBody);
  const actual = signatureHeader.trim();
  if (Buffer.byteLength(actual) !== Buffer.byteLength(expected)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual, "utf8"), Buffer.from(expected, "utf8"));
}

export function isBlockedIpAddress(ipInput: string): boolean {
  const ip = ipInput.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!ip) return true;

  if (ip.startsWith("::ffff:")) {
    const mapped = ip.slice("::ffff:".length);
    if (isIP(mapped) === 4) {
      return isBlockedIpAddress(mapped);
    }
  }

  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }

  if (version === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(ip)) return true;
    if (ip.startsWith("ff")) return true;
    return false;
  }

  return true;
}

export function validateSafeWebhookUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Please enter an HTTPS webhook URL.");
  }
  if (trimmed.length > 500) {
    throw new Error("Webhook URL must not exceed 500 characters.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid HTTPS webhook URL (for example https://tenhchat.com/api/webhooks/tenh-pos).");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use https://.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Webhook URL must not include embedded credentials.");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".")
  ) {
    throw new Error("Webhook URL must point to a public domain name.");
  }

  if (isIP(host) !== 0 && isBlockedIpAddress(host)) {
    throw new Error("Private, loopback, or reserved IP addresses are not permitted.");
  }

  return parsed;
}

export function normalizeWebhookEvents(input: unknown): WebhookEventType[] {
  const allowed = new Set<string>(ALLOWED_WEBHOOK_EVENTS);
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];

  const cleaned = raw
    .map((item) => String(item).trim())
    .filter((item): item is WebhookEventType => allowed.has(item));

  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : [...ALLOWED_WEBHOOK_EVENTS];
}
