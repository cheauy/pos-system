import { createBrowserClient } from "@supabase/ssr";

import { getSharedAuthCookieOptions } from "@/lib/tenancy/domain";

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

  return createBrowserClient(supabaseUrl, supabaseKey, {
    cookieOptions: getSharedAuthCookieOptions(hostname),
  });
}
