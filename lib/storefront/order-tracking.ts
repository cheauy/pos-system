export type SavedOrder = { token: string; number: string };
export function trackingToken(value: string): string | null {
  const input = value.trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(input)) return input;
  try { const url = new URL(input, "https://store.invalid"); if (!["http:", "https:"].includes(url.protocol)) return null; const token = url.pathname.match(/^\/order\/([^/]+)\/?$/)?.[1]; return token && uuid.test(token) ? token : null; } catch { return null; }
}
export function recentOrders(slug: string): SavedOrder[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(`tenh-orders:${slug}`) || "[]"); return Array.isArray(value) ? value.filter((item): item is SavedOrder => Boolean(item && typeof item.token === "string" && trackingToken(item.token) === item.token && typeof item.number === "string")).slice(0, 20) : []; } catch { return []; }
}
export function rememberOrder(slug: string, token: string, number: string) {
  if (trackingToken(token) !== token) return;
  try { localStorage.setItem(`tenh-orders:${slug}`, JSON.stringify([{ token, number }, ...recentOrders(slug).filter(item => item.token !== token)].slice(0, 20))); } catch { /* Tracking links still work when storage is unavailable. */ }
}
