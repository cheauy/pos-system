import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import {
  APP_SUBDOMAIN,
  getAppUrl,
  getRootUrl,
  getSharedAuthCookieOptions,
  getSubdomainFromHost,
  getTenantDashboardUrl,
  getTenantSlugFromHost,
  normalizeTenantSlug,
  usesSharedSubdomainCookies,
} from "@/lib/tenancy/domain";

const CENTRAL_AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/team-setup",
]);

const INTERNAL_STOREFRONT_PREFIX = "/storefront";

const APP_ONLY_PREFIXES = [
  "/dashboard",
  "/super-admin",
  "/get-started",
  "/account-disabled",
  "/business-disabled",
  "/no-business",
];

function isCentralAuthPath(pathname: string) {
  return (
    pathname.startsWith("/auth/") ||
    Array.from(CENTRAL_AUTH_PATHS).some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

function isInternalStorefrontPath(pathname: string) {
  return (
    pathname === INTERNAL_STOREFRONT_PREFIX ||
    pathname.startsWith(`${INTERNAL_STOREFRONT_PREFIX}/`)
  );
}

function isAppOnlyPath(pathname: string) {
  return APP_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function requestPath(request: NextRequest) {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function notFound() {
  return new NextResponse("Not Found", { status: 404 });
}

function createResponse(
  request: NextRequest,
  requestHeaders: Headers,
  subdomain: string | null,
  tenantSlug: string | null,
) {
  const pathname = request.nextUrl.pathname;
  const pathWithSearch = requestPath(request);
  const productionDomains = usesSharedSubdomainCookies();

  if (subdomain === "www") {
    return NextResponse.redirect(getRootUrl(pathWithSearch));
  }

  // Preserve old admin.tenh-pos.com bookmarks without keeping a second admin
  // application host. It is reserved and redirects to the centralized app.
  if (productionDomains && subdomain === "admin") {
    return NextResponse.redirect(
      getAppUrl(pathname === "/" ? "/super-admin/businesses" : pathWithSearch),
    );
  }

  // Login/authentication is centralized on app.tenh-pos.com. Public tenant
  // hosts never run TENH owner/staff authentication pages.
  if (
    productionDomains &&
    isCentralAuthPath(pathname) &&
    subdomain !== APP_SUBDOMAIN
  ) {
    return NextResponse.redirect(getAppUrl(pathWithSearch));
  }

  // Existing/legacy tenant dashboard URLs may still exist in bookmarks or old
  // links. Redirect them into app.tenh-pos.com while preserving the requested
  // business selection through the authenticated selector route.
  if (productionDomains && tenantSlug && isAppOnlyPath(pathname)) {
    if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
      return NextResponse.redirect(
        getTenantDashboardUrl(tenantSlug, pathWithSearch),
      );
    }

    return NextResponse.redirect(getAppUrl(pathWithSearch));
  }

  // Keep the plan picker on the stable Subscription route. This also
  // recovers old /subscription/plans bookmarks if a stale dev route manifest
  // or an older deployment no longer exposes that nested page.
  if (!tenantSlug && pathname === "/dashboard/settings/subscription/plans") {
    const destination = new URL(getAppUrl("/dashboard/settings/subscription"));
    for (const [key, value] of request.nextUrl.searchParams.entries()) {
      destination.searchParams.append(key, value);
    }
    destination.searchParams.set("view", "plans");
    return NextResponse.redirect(destination);
  }

  // Marketing/root-host application routes belong on the app domain.
  if (
    productionDomains &&
    !subdomain &&
    isAppOnlyPath(pathname)
  ) {
    return NextResponse.redirect(getAppUrl(pathWithSearch));
  }

  if (subdomain === APP_SUBDOMAIN) {
    if (pathname === "/") {
      return NextResponse.redirect(getAppUrl("/dashboard"));
    }

    // Internal storefront implementation paths are never public on app host.
    if (
      pathname.startsWith("/_sites/") ||
      isInternalStorefrontPath(pathname)
    ) {
      return notFound();
    }
  }

  // Never expose TENH's internal storefront route directly from a root or
  // arbitrary/system host. app/_sites is a Next.js private folder and the
  // routable /storefront wrapper exists only as an internal rewrite target.
  if (
    !tenantSlug &&
    (pathname.startsWith("/_sites/") || isInternalStorefrontPath(pathname))
  ) {
    return notFound();
  }

  // Wildcard DNS may receive any label. Reserved/invalid labels (other than
  // explicit www/app/admin handling above) must never become storefronts.
  if (
    subdomain &&
    !tenantSlug &&
    subdomain !== "www" &&
    subdomain !== APP_SUBDOMAIN &&
    subdomain !== "admin"
  ) {
    return notFound();
  }

  if (tenantSlug) {
    // Customers follow this URL immediately after checkout on the same host.
    if (/^\/order\/[^/]+\/?$/.test(pathname)) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // Storefront APIs are the only API surface exposed on tenant hosts.
    if (pathname.startsWith("/api/storefront/")) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (pathname.startsWith("/api/")) {
      return notFound();
    }

    if (
      pathname.startsWith("/_sites/") ||
      isInternalStorefrontPath(pathname)
    ) {
      return notFound();
    }

    if (pathname === "/") {
      const destination = request.nextUrl.clone();
      destination.pathname = `/storefront/${encodeURIComponent(tenantSlug)}`;

      return NextResponse.rewrite(destination, {
        request: { headers: requestHeaders },
      });
    }

    // Current TENH storefront is rendered from its public root. Do not allow
    // admin/marketing application routes to bleed into tenant hostnames.
    return notFound();
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

async function refreshAuthIfNeeded(
  request: NextRequest,
  response: NextResponse,
) {
  const pathname = request.nextUrl.pathname;

  const needsAuthRefresh =
    isAppOnlyPath(pathname) ||
    isCentralAuthPath(pathname);

  if (!needsAuthRefresh) return response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return response;

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const cookieOptions = getSharedAuthCookieOptions(host);

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, {
            ...cookieOptions,
            ...options,
          });
        });
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export async function proxy(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const subdomain = getSubdomainFromHost(host);
  const tenantSlug = getTenantSlugFromHost(host);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenh-pathname", request.nextUrl.pathname);

  if (tenantSlug) {
    requestHeaders.set("x-tenant-slug", normalizeTenantSlug(tenantSlug));
  } else {
    requestHeaders.delete("x-tenant-slug");
  }

  const response = createResponse(
    request,
    requestHeaders,
    subdomain,
    tenantSlug,
  );

  return refreshAuthIfNeeded(request, response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
