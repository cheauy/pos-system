begin;
create table if not exists public.platform_support_reports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  title text not null check (char_length(title) between 3 and 160),
  description text not null check (char_length(description) between 10 and 6000),
  page_path text not null default '' check (char_length(page_path) <= 500),
  priority text not null default 'normal' check (priority in ('low','normal','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_support_reports enable row level security;
revoke all on public.platform_support_reports from anon, authenticated;
grant select, insert, update on public.platform_support_reports to service_role;
create index if not exists platform_support_reports_created_idx on public.platform_support_reports(created_at desc);
notify pgrst, 'reload schema';
commit;
