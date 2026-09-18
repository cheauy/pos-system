const DEFAULT_ROOT_DOMAIN = "localhost:3000";

export const APP_SUBDOMAIN = "app";

/**
 * System/reserved labels that must never resolve to a public tenant store.
 * Keep this list centralized so registration, store-address changes and
 * hostname routing all enforce the same rule.
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
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ??
      DEFAULT_ROOT_DOMAIN,
  );
}

export function getRootHostname() {
  return getRootDomain().replace(/:\d+$/, "");
}

export function isLocalRootDomain() {
  const hostname = getRootHostname();

  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

export function usesSharedSubdomainCookies() {
  return !isLocalRootDomain();
}

export function getRootProtocol() {
  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).protocol.replace(
        ":",
        "",
      );
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
  return `${getRootProtocol()}://${getRootDomain()}${normalizePath(
    path,
  )}`;
}

export function getSubdomainUrl(
  subdomain: string,
  path = "/",
) {
  const normalized = normalizeTenantSlug(subdomain);

  if (!normalized) {
    throw new Error("Invalid subdomain.");
  }

  return `${getRootProtocol()}://${normalized}.${getRootDomain()}${normalizePath(
    path,
  )}`;
}

/**
 * Canonical URL for the TENH POS application. In local development the
 * application stays on localhost; in production it lives on app.tenh-pos.com.
 */
export function getAppUrl(path = "/dashboard") {
  if (!usesSharedSubdomainCookies()) {
    return normalizePath(path);
  }

  return getSubdomainUrl(APP_SUBDOMAIN, path);
}

/**
 * Backward-compatible helper kept for existing call sites. Tenant subdomains
 * are storefront-only now, so every dashboard destination is canonicalized to
 * the centralized app host instead of {slug}.tenh-pos.com.
 */
export function getTenantDashboardUrl(
  _slug: string,
  path = "/dashboard",
) {
  return getAppUrl(path);
}

export function getAdminUrl(
  path = "/super-admin/businesses",
) {
  if (!usesSharedSubdomainCookies()) {
    return normalizePath(path);
  }

  return getSubdomainUrl("admin", path);
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
  const candidate = value.toLowerCase().trim();
  const slug = normalizeTenantSlug(value);

  return (
    candidate === slug &&
    slug.length >= 2 &&
    slug.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) &&
    !RESERVED_SUBDOMAINS.has(slug)
  );
}

export function getSubdomainFromHost(
  hostHeader: string | null | undefined,
) {
  if (!hostHeader) return null;

  const rawHost = hostHeader
    .split(",")[0]
    ?.trim()
    .toLowerCase();

  if (!rawHost) return null;

  const hostname = rawHost.replace(/:\d+$/, "");
  const rootHostname = getRootHostname();

  if (
    hostname === rootHostname ||
    hostname === `www.${rootHostname}`
  ) {
    return hostname.startsWith("www.") ? "www" : null;
  }

  const suffix = `.${rootHostname}`;

  if (!hostname.endsWith(suffix)) {
    return null;
  }

  const prefix = hostname.slice(0, -suffix.length);

  // TENH only supports one tenant/system label before the root domain.
  if (!prefix || prefix.includes(".")) {
    return null;
  }

  return prefix;
}

export function isAppHost(
  hostHeader: string | null | undefined,
) {
  return getSubdomainFromHost(hostHeader) === APP_SUBDOMAIN;
}

export function getTenantSlugFromHost(
  hostHeader: string | null | undefined,
) {
  const subdomain = getSubdomainFromHost(hostHeader);

  if (
    !subdomain ||
    RESERVED_SUBDOMAINS.has(subdomain)
  ) {
    return null;
  }

  return isValidTenantSlug(subdomain)
    ? normalizeTenantSlug(subdomain)
    : null;
}

export function getSharedAuthCookieOptions(
  currentHostname?: string | null,
) {
  const rootHostname = getRootHostname();
  const current = currentHostname
    ?.toLowerCase()
    .replace(/:\d+$/, "");

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
