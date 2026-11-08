import { getDomainStatus } from "../../../../lib/domain-status.ts";
import { pollingRetryAfter } from "../../../../lib/rate-limit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const retryAfter = pollingRetryAfter(request);
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
  if (retryAfter) return Response.json({ error: "Too many requests" }, { status: 429, headers: { ...headers, "Retry-After": String(retryAfter) } });
  return Response.json(await getDomainStatus(), { headers });
}
