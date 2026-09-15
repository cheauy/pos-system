import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { getSharedAuthCookieOptions } from "@/lib/tenancy/domain";

export async function createClient() {
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
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(
            ({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...cookieOptions,
                ...options,
              });
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
