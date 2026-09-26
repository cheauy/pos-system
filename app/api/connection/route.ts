// A lightweight reachability check. Never reads business data or retries writes.
export function GET() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
