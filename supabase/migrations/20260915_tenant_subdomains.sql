-- TENH POS tenant subdomain foundation.
-- Safe for existing slugs that already follow lowercase letters/numbers/hyphens.

create unique index if not exists businesses_slug_unique_ci
  on public.businesses (lower(slug));

comment on column public.businesses.slug is
  'Public TENH POS tenant subdomain label, e.g. melody -> melody.tenh-pos.com';
