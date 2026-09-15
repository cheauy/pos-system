import "server-only";

import { headers } from "next/headers";

import {
  getTenantSlugFromHost,
  normalizeTenantSlug,
} from "./domain";

export async function getRequestTenantSlug() {
  const requestHeaders = await headers();

  const forwardedTenant = requestHeaders.get(
    "x-tenant-slug",
  );

  if (forwardedTenant) {
    const normalized = normalizeTenantSlug(
      forwardedTenant,
    );

    return normalized || null;
  }

  return getTenantSlugFromHost(
    requestHeaders.get("host"),
  );
}
