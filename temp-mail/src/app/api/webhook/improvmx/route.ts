import { after, NextResponse } from "next/server.js";
import { normalizeEmail } from "../../../../lib/config.ts";
import { addEmail, clearInbox, deliveryReady, extractOTP, getEmailsByRecipient, messageId, recordDomainReceipt } from "../../../../lib/store.ts";
import { authenticWebhook, ForbiddenRecipientError, parseWebhook, readPayload } from "../../../../lib/webhook.ts";
import { pollingRetryAfter } from "../../../../lib/rate-limit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" },
});

export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SECRET || process.env.IMPROVMX_WEBHOOK_SECRET;
  const params = new URL(request.url).searchParams;
  const tokens = [request.headers.get("x-webhook-secret"), params.get("secret"),
    request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null, params.get("token")];
  if (secret && !tokens.some((token) => authenticWebhook(token, secret))) return json({ error: "Unauthorized" }, 401);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Expected application/json" }, 415);
  let email: ReturnType<typeof parseWebhook>;
  try {
    email = parseWebhook(await readPayload(request));
  } catch (error) {
    // Oversized spam is discarded rather than retried; it never reaches storage.
    if (error instanceof RangeError) return json({ status: "ok" });
    return json({ error: error instanceof ForbiddenRecipientError ? "Forbidden recipient domain" : "Invalid email payload" }, error instanceof ForbiddenRecipientError ? 403 : 400);
  }
  if (!deliveryReady()) return json({ error: "Shared email storage is not configured" }, 503);
  after(async () => {
    try {
      const otp = extractOTP(email.subject, `${email.text}\n${email.html}`);
      await Promise.all(email.recipients.map((recipient) => addEmail({
        id: messageId(recipient, email.source), recipient, sender: email.sender,
        subject: email.subject, text: email.text, html: email.html, timestamp: email.timestamp, otp_code: otp,
      })));
      try {
        await Promise.all([...new Set(email.recipients.map((recipient) => recipient.split("@")[1]))].map(recordDomainReceipt));
      } catch {
        console.error("Temp Mail domain receipt tracking failed");
      }
    } catch {
      // Do not log recipients, message contents, or webhook URLs/secrets.
      console.error("Temp Mail background email storage failed");
    }
  });
  return json({ status: "ok" });
}

function rateLimit(request: Request) {
  const seconds = pollingRetryAfter(request);
  if (!seconds) return null;
  const response = json({ error: "Too many requests" }, 429);
  response.headers.set("Retry-After", String(seconds));
  return response;
}

export async function GET(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const email = normalizeEmail(params.get("email"));
  if (!email) return json({ error: "Enter a valid address on a supported domain" }, 400);
  try {
    const emails = await getEmailsByRecipient(email);
    return json({ emails, deliveryReady: deliveryReady() });
  } catch {
    return json({ error: "Inbox temporarily unavailable" }, 503);
  }
}

export async function DELETE(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Forbidden origin" }, 403);
  const email = normalizeEmail(new URL(request.url).searchParams.get("email"));
  if (!email) return json({ error: "Enter a valid address on a supported domain" }, 400);
  try { await clearInbox(email); return json({ cleared: true }); }
  catch { return json({ error: "Could not clear inbox" }, 503); }
}
