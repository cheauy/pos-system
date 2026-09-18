const DEFAULT_ROOT_DOMAIN = "localhost:3000";

export const APP_SUBDOMAIN = "app";
export const SELECTED_BUSINESS_COOKIE = "tenh_selected_business_id";

/**
 * TENH/system labels that can never be claimed as a public store slug.
 * Keep this centralized so creation, changes, routing and availability checks
 * all enforce the same rule.
 */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "auth",
  "dashboard",
  "login",
  "signin",
  "signup",
  "register",
  "support",
  "help",
  "billing",
  "checkout",
  "payment",
  "payments",
  "pos",
  "store",
  "status",
  "mail",
  "smtp",
  "ftp",
  "tenh",
  "tenh-pos",
  "static",
  "assets",
]);

function stripProtocol(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function getRootDomain() {
  return stripProtocol(
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN,
  );
}

export function getRootHostname() {
  return getRootDomain().replace(/:\d+$/, "");
}

export function isLocalRootDomain() {
  const hostname = getRootHostname();
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function usesSharedSubdomainCookies() {
  return !isLocalRootDomain();
}

export function getRootProtocol() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).protocol.replace(":", "");
    } catch {
      // Fall through to the root-domain based default.
    }
  }

  return isLocalRootDomain() ? "http" : "https";
}

function normalizePath(path: string) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getRootUrl(path = "/") {
  return `${getRootProtocol()}://${getRootDomain()}${normalizePath(path)}`;
}

export function getSubdomainUrl(subdomain: string, path = "/") {
  const normalized = normalizeTenantSlug(subdomain);

  if (!normalized) {
    throw new Error("Invalid subdomain.");
  }

  return `${getRootProtocol()}://${normalized}.${getRootDomain()}${normalizePath(
    path,
  )}`;
}

/** Canonical TENH POS application URL. */
export function getAppUrl(path = "/dashboard") {
  if (isLocalRootDomain()) {
    return getRootUrl(path);
  }

  return getSubdomainUrl(APP_SUBDOMAIN, path);
}

/**
 * Backward-compatible dashboard destination helper.
 *
 * Existing callers already know the business slug. Instead of putting admin
 * pages on that tenant hostname, route through the centralized app host. The
 * selector endpoint resolves the slug to the permanent business UUID, verifies
 * membership, stores only that UUID in an app-host cookie, then redirects to
 * the requested application path.
 */
export function getTenantDashboardUrl(slug: string, path = "/dashboard") {
  const normalized = normalizeTenantSlug(slug);

  if (!isValidTenantSlug(normalized)) {
    return getAppUrl(path);
  }

  const selector = new URL(getAppUrl("/auth/select-business"));
  selector.searchParams.set("slug", normalized);
  selector.searchParams.set("next", normalizePath(path));
  return selector.toString();
}

/** Super-admin is also part of the centralized application host. */
export function getAdminUrl(path = "/super-admin/businesses") {
  return getAppUrl(path);
}

export function normalizeTenantSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidTenantSlug(value: string) {
  const trimmed = value.trim();
  const candidate = trimmed.toLowerCase();
  const slug = normalizeTenantSlug(value);

  return (
    trimmed === candidate &&
    candidate === slug &&
    slug.length >= 2 &&
    slug.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) &&
    !RESERVED_SUBDOMAINS.has(slug)
  );
}

export function getSubdomainFromHost(hostHeader: string | null | undefined) {
  if (!hostHeader) return null;

  const rawHost = hostHeader.split(",")[0]?.trim().toLowerCase();
  if (!rawHost) return null;

  const hostname = rawHost.replace(/:\d+$/, "");
  const rootHostname = getRootHostname();

  if (hostname === rootHostname || hostname === `www.${rootHostname}`) {
    return hostname.startsWith("www.") ? "www" : null;
  }

  const suffix = `.${rootHostname}`;
  if (!hostname.endsWith(suffix)) return null;

  const prefix = hostname.slice(0, -suffix.length);

  // TENH supports one system/tenant label before the root domain.
  if (!prefix || prefix.includes(".")) return null;

  return prefix;
}

export function isAppHost(hostHeader: string | null | undefined) {
  return getSubdomainFromHost(hostHeader) === APP_SUBDOMAIN;
}

export function getTenantSlugFromHost(
  hostHeader: string | null | undefined,
) {
  const subdomain = getSubdomainFromHost(hostHeader);

  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) {
    return null;
  }

  return isValidTenantSlug(subdomain)
    ? normalizeTenantSlug(subdomain)
    : null;
}

export function getSharedAuthCookieOptions(currentHostname?: string | null) {
  const rootHostname = getRootHostname();
  const current = currentHostname?.toLowerCase().replace(/:\d+$/, "");

  const belongsToRoot =
    !current ||
    current === rootHostname ||
    current.endsWith(`.${rootHostname}`);

  return {
    path: "/",
    sameSite: "lax" as const,
    secure: !isLocalRootDomain(),
    ...(usesSharedSubdomainCookies() && belongsToRoot
      ? { domain: `.${rootHostname}` }
      : {}),
  };
}
