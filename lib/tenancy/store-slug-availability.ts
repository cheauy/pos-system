import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  RESERVED_SUBDOMAINS,
  isValidTenantSlug,
  normalizeTenantSlug,
} from "./domain";

export type StoreSlugAvailabilityStatus =
  | "available"
  | "already_taken"
  | "reserved"
  | "invalid";

export type StoreSlugAvailability = {
  status: StoreSlugAvailabilityStatus;
  slug: string;
};

type StoreSlugAvailabilityOptions = {
  excludeBusinessId?: string;
};

/**
 * Canonical backend check for a TENH-owned public store subdomain.
 * The slug is only a locator; authorization/data ownership remains UUID-based.
 */
export async function getStoreSlugAvailability(
  rawValue: string,
  options: StoreSlugAvailabilityOptions = {},
): Promise<StoreSlugAvailability> {
  const trimmed = rawValue.trim();
  const raw = trimmed.toLowerCase();
  const slug = normalizeTenantSlug(rawValue);

  // Preserve the existing TENH UI/product rule of 2-40 characters even though
  // a DNS label can technically be longer.
  if (
    !raw ||
    raw.length > 40 ||
    trimmed !== raw ||
    slug !== raw ||
    slug.length < 2
  ) {
    return { status: "invalid", slug };
  }

  if (RESERVED_SUBDOMAINS.has(slug)) {
    return { status: "reserved", slug };
  }

  if (!isValidTenantSlug(slug)) {
    return { status: "invalid", slug };
  }

  let query = supabaseAdmin.from("businesses").select("id").ilike("slug", slug);

  if (options.excludeBusinessId) {
    query = query.neq("id", options.excludeBusinessId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new Error(`Unable to check store address: ${error.message}`);
  }

  return {
    status: data ? "already_taken" : "available",
    slug,
  };
}
