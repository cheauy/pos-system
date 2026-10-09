import type { CookieOptions } from "@supabase/ssr";

export const REMEMBER_ME_COOKIE = "tenh_remember_me";
export const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;
// Hard ceiling for any web session, remembered or not, counted from sign-in.
export const SESSION_MAX_SECONDS = REMEMBER_ME_SECONDS;

// "1:<sign-in epoch ms>" means remembered until exactly 30 days after that
// sign-in. Anything else ("0", legacy "1", missing) is a browser-session login.
export function rememberMeValue(remember: boolean, now = Date.now()) {
  return remember ? `1:${now}` : "0";
}

export function rememberedUntil(preference?: string): number | null {
  const match = /^1:(\d{1,15})$/.exec(preference ?? "");
  return match ? Number(match[1]) + REMEMBER_ME_SECONDS * 1000 : null;
}

export function isRemembered(preference?: string, now = Date.now()) {
  const until = rememberedUntil(preference);
  return until !== null && until > now;
}

// Apply on every browser/server refresh, not only on the initial sign-in.
// A refresh rewrites the cookies with the same absolute expiry, so token
// refreshes never extend a remembered login past its 30-day deadline.
export function sessionCookieOptions(name: string, value: string, options: CookieOptions, preference?: string, now = Date.now()): CookieOptions {
  if (!/^sb-.+-auth-token(?:\.\d+)?$/.test(name) || !value || options.maxAge === 0) return options;
  const result = { ...options };
  delete result.expires;
  delete result.maxAge;
  const until = rememberedUntil(preference);
  if (until !== null && until > now) result.expires = new Date(until);
  return result;
}

// Supabase keeps the sign-in time in the access token's amr claim and carries
// it unchanged through refreshes. Only call this with a token that the Auth
// server has just verified (after getUser()).
export function sessionStartedAt(accessToken: string): number | null {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const times = (Array.isArray(payload.amr) ? payload.amr : [])
      .map((entry: { timestamp?: unknown }) => entry?.timestamp)
      .filter((time: unknown): time is number => typeof time === "number" && Number.isFinite(time));
    return times.length ? Math.min(...times) * 1000 : null;
  } catch {
    return null;
  }
}

export function sessionExpired(accessToken: string, now = Date.now()) {
  const startedAt = sessionStartedAt(accessToken);
  return startedAt !== null && now - startedAt >= SESSION_MAX_SECONDS * 1000;
}
