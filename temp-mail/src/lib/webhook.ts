import { createHash, timingSafeEqual } from "node:crypto";
import { MAIL_DOMAINS, normalizeEmail } from "./config.ts";

export class ForbiddenRecipientError extends Error {}
export const MAX_EMAIL_BODY_BYTES = 200 * 1024;

export function authenticWebhook(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(createHash("sha256").update(provided).digest(), createHash("sha256").update(expected).digest());
}

function address(value: unknown): string | null {
  if (typeof value === "string") return value.match(/<([^<>]+)>/)?.[1] ?? value;
  if (value && typeof value === "object" && "email" in value && typeof value.email === "string") return value.email;
  return null;
}

export function parseWebhook(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Expected a JSON object");
  const data = payload as Record<string, unknown>;
  // Envelope recipients preserve catch-all/BCC addresses that may be absent from the visible To header.
  const headers = data.headers && typeof data.headers === "object" ? data.headers as Record<string, unknown> : {};
  const delivered = Object.entries(headers).find(([key]) => key.toLowerCase() === "delivered-to")?.[1];
  const target = data.recipient ?? delivered ?? data.to;
  const targets = Array.isArray(target) ? target : [target];
  if (targets.length > 20) throw new Error("Too many recipients");
  const recipients = [...new Set(targets.map((value) => {
    const raw = address(value)?.trim().toLowerCase();
    const domain = raw?.split("@").at(-1);
    if (domain && !MAIL_DOMAINS.some((item) => item === domain)) throw new ForbiddenRecipientError("Forbidden recipient domain");
    const recipient = normalizeEmail(raw);
    if (!recipient) throw new Error("Invalid recipient");
    return recipient;
  }))];
  if (!recipients.length) throw new Error("No supported recipient");
  const sender = address(data.sender ?? data.from);
  if (!sender || sender.length > 320 || !sender.includes("@")) throw new Error("Invalid sender");
  const field = (key: string, max: number) => {
    const value = data[key] ?? "";
    if (typeof value !== "string" || value.length > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const subject = field("subject", 1000);
  const body = (key: string) => {
    const value = field(key, Number.MAX_SAFE_INTEGER);
    const bytes = Buffer.from(value);
    // Remove an incomplete UTF-8 character at the byte boundary.
    return bytes.length > MAX_EMAIL_BODY_BYTES ? bytes.subarray(0, MAX_EMAIL_BODY_BYTES).toString("utf8").replace(/\uFFFD$/, "") : value;
  };
  const text = body("text");
  const html = body("html");
  const stamp = data.timestamp;
  let timestamp = Date.now();
  if (typeof stamp === "number" || typeof stamp === "string") {
    const numeric = Number(stamp);
    const parsed = Number.isFinite(numeric) ? numeric * (numeric < 1e12 ? 1000 : 1) : Date.parse(String(stamp));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Invalid timestamp");
    timestamp = Math.min(parsed, Date.now());
  }
  const providerId = data["message-id"] ?? data.id;
  if (providerId !== undefined && (typeof providerId !== "string" || providerId.length > 1000)) throw new Error("Invalid message id");
  return { recipients, sender, subject, text, html, timestamp, source: providerId || JSON.stringify([sender, subject, text, html]) };
}

export async function readPayload(request: Request): Promise<unknown> {
  const max = 1024 * 1024;
  if (Number(request.headers.get("content-length")) > max) { await request.body?.cancel(); throw new RangeError("Payload too large"); }
  if (!request.body) throw new Error("Missing payload");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new RangeError("Payload too large"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
