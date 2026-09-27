import { createServerClient } from "@supabase/ssr";
import { createClient as createTokenClient } from '@supabase/supabase-js';
import { mobileRequest } from '@/lib/mobile/request-context';
import { cookies, headers } from "next/headers";
import { REMEMBER_ME_COOKIE, sessionCookieOptions } from "@/lib/auth/session-persistence";

import { getSharedAuthCookieOptions } from "@/lib/tenancy/domain";

export async function createClient(branchHeaders?: Record<string, string>) {
  const mobile = mobileRequest.getStore();
  if (mobile) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Missing Supabase environment variables.');
    return createTokenClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { ...branchHeaders, Authorization: `Bearer ${mobile.token}` } },
    });
  }
  const cookieStore = await cookies();
  const requestHeaders = await headers();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const cookieOptions = getSharedAuthCookieOptions(
    requestHeaders.get("host"),
  );

  return createServerClient(supabaseUrl, supabaseKey, {
    global: branchHeaders ? { headers: branchHeaders } : undefined,
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(
            ({ name, value, options }) => {
              cookieStore.set(name, value, sessionCookieOptions(name, value, {
                ...cookieOptions,
                ...options,
              }, cookieStore.get(REMEMBER_ME_COOKIE)?.value));
            },
          );
        } catch {
          // Cookies cannot always be changed inside Server Components.
          // proxy.ts refreshes auth cookies on authenticated routes.
        }
      },
    },
  });
}
