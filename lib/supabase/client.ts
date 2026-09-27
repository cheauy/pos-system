import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { REMEMBER_ME_COOKIE, REMEMBER_ME_SECONDS, sessionCookieOptions } from "@/lib/auth/session-persistence";
import { clearPasswordRecovery, recordPasswordRecovery } from "@/lib/auth/password-recovery";

import { getSharedAuthCookieOptions } from "@/lib/tenancy/domain";

let trackedClient: ReturnType<typeof createBrowserClient> | undefined;

export function setRememberMe(remember: boolean) {
  document.cookie = serializeCookieHeader(REMEMBER_ME_COOKIE, remember ? "1" : "0", {
    ...getSharedAuthCookieOptions(window.location.hostname),
    ...(remember ? { maxAge: REMEMBER_ME_SECONDS } : {}),
  });
}

export function getRememberMe() {
  return parseCookieHeader(document.cookie).find(cookie => cookie.name === REMEMBER_ME_COOKIE)?.value === "1";
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const hostname =
    typeof window === "undefined"
      ? undefined
      : window.location.hostname;

  const client = createBrowserClient(supabaseUrl, supabaseKey, {
    cookieOptions: getSharedAuthCookieOptions(hostname),
    cookies: {
      getAll: () => typeof document === "undefined" ? [] : parseCookieHeader(document.cookie),
      setAll(cookies) {
        const preference = parseCookieHeader(document.cookie).find(cookie => cookie.name === REMEMBER_ME_COOKIE)?.value;
        cookies.forEach(({name,value,options}) => {
          document.cookie = serializeCookieHeader(name,value,sessionCookieOptions(name,value,options,preference));
        });
      },
    },
  });
  if (typeof window !== "undefined" && trackedClient !== client) {
    trackedClient = client;
    client.auth.onAuthStateChange((event, session) => {
      try {
        if (event === "PASSWORD_RECOVERY" && session?.user) recordPasswordRecovery(window.sessionStorage, session.user.id);
        else if (event === "SIGNED_OUT" || event === "SIGNED_IN") clearPasswordRecovery(window.sessionStorage);
      } catch { /* Browser storage can be disabled. */ }
    });
  }
  return client;
}
