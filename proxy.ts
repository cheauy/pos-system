import { createServerClient } from "@supabase/ssr";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getRootUrl,
  getSharedAuthCookieOptions,
  getSubdomainFromHost,
  getTenantSlugFromHost,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

const CENTRAL_AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth/continue",
  "/auth/callback",
]);

function createResponse(
  request: NextRequest,
  requestHeaders: Headers,
  subdomain: string | null,
  tenantSlug: string | null,
) {
  const pathname = request.nextUrl.pathname;

  if (subdomain === "www") {
    return NextResponse.redirect(
      getRootUrl(
        `${pathname}${request.nextUrl.search}`,
      ),
    );
  }

  if (
    tenantSlug &&
    CENTRAL_AUTH_PATHS.has(pathname)
  ) {
    return NextResponse.redirect(
      getRootUrl(
        `${pathname}${request.nextUrl.search}`,
      ),
    );
  }

  if (subdomain === "admin" && pathname === "/") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/super-admin/businesses";
    return NextResponse.redirect(destination);
  }

  if (tenantSlug && pathname === "/") {
    const destination = request.nextUrl.clone();
    destination.pathname = `/_sites/${encodeURIComponent(
      tenantSlug,
    )}`;

    return NextResponse.rewrite(destination, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

async function refreshAuthIfNeeded(
  request: NextRequest,
  response: NextResponse,
) {
  const pathname = request.nextUrl.pathname;

  const needsAuthRefresh =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/auth/") ||
    CENTRAL_AUTH_PATHS.has(pathname);

  if (!needsAuthRefresh) {
    return response;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const cookieOptions =
    getSharedAuthCookieOptions(
      request.headers.get("host"),
    );

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, {
                ...cookieOptions,
                ...options,
              });
            },
          );
        },
      },
    },
  );

  // Refreshes the Supabase session when required.
  await supabase.auth.getUser();

  return response;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const subdomain = getSubdomainFromHost(host);
  const tenantSlug = getTenantSlugFromHost(host);

  const requestHeaders = new Headers(
    request.headers,
  );

  if (tenantSlug) {
    requestHeaders.set(
      "x-tenant-slug",
      normalizeTenantSlug(tenantSlug),
    );
  } else {
    requestHeaders.delete("x-tenant-slug");
  }

  const response = createResponse(
    request,
    requestHeaders,
    subdomain,
    tenantSlug,
  );

  return refreshAuthIfNeeded(
    request,
    response,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
