import type { CookieOptions } from "@supabase/ssr";

export const REMEMBER_ME_COOKIE = "tenh_remember_me";
export const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;

// Apply on every browser/server refresh, not only on the initial sign-in.
export function sessionCookieOptions(name: string, value: string, options: CookieOptions, preference?: string): CookieOptions {
  if (!/^sb-.+-auth-token(?:\.\d+)?$/.test(name) || !value || options.maxAge === 0) return options;
  const result = { ...options };
  delete result.expires;
  if (preference === "1") result.maxAge = REMEMBER_ME_SECONDS;
  else delete result.maxAge;
  return result;
}
