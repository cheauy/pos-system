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
 *
 * The slug is only a public locator. Business ownership and authorization
 * continue to use businesses.id (UUID) and business_id on tenant records.
 */
export async function getStoreSlugAvailability(
  rawValue: string,
  options: StoreSlugAvailabilityOptions = {},
): Promise<StoreSlugAvailability> {
  const raw = rawValue.trim().toLowerCase();
  const slug = normalizeTenantSlug(rawValue);

  // Store addresses intentionally use the existing 2-40 character product
  // rule even though DNS labels can technically be longer.
  if (
    !raw ||
    raw.length > 40 ||
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

  let query = supabaseAdmin
    .from("businesses")
    .select("id")
    .ilike("slug", slug);

  if (options.excludeBusinessId) {
    query = query.neq("id", options.excludeBusinessId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new Error(
      `Unable to check store address: ${error.message}`,
    );
  }

  return {
    status: data ? "already_taken" : "available",
    slug,
  };
}
