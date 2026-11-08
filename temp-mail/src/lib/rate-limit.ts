declare global {
  var __inboxRateLimits: Map<string, { count: number; reset: number }> | undefined;
}

const limits = globalThis.__inboxRateLimits ??= new Map<string, { count: number; reset: number }>();

export function pollingRetryAfter(request: Request, now = Date.now()): number {
  // shortcut: limits are per process; add a shared limiter/firewall for enforcement across serverless instances.
  // Trust forwarded IP headers only behind a proxy that overwrites them (as Vercel does).
  const ip = (request.headers.get(process.env.VERCEL ? "x-vercel-forwarded-for" : "x-forwarded-for") ?? "unknown").split(",")[0].trim();
  for (const [key, value] of limits) if (value.reset <= now) limits.delete(key);
  let bucket = limits.get(ip);
  if (!bucket) {
    if (limits.size >= 10_000) return 60;
    bucket = { count: 0, reset: now + 60_000 };
    limits.set(ip, bucket);
  }
  if (bucket.count >= 30) return Math.max(1, Math.ceil((bucket.reset - now) / 1000));
  bucket.count++;
  return 0;
}
