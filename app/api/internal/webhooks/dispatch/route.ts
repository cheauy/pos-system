import { timingSafeEqual } from "node:crypto";

import { dispatchBusinessWebhooks } from "@/lib/integrations/webhook-dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const received = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(received) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await dispatchBusinessWebhooks({ limit: 30 });
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Webhook dispatch failed.",
      },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
