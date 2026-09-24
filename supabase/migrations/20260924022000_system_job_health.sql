-- Latest execution only; no customer data or secrets are stored here.
begin;
create table if not exists public.system_job_health (
  job_name text primary key,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz
);
alter table public.system_job_health enable row level security;
revoke all on public.system_job_health from public, anon, authenticated;
grant select, insert, update on public.system_job_health to service_role;
notify pgrst, 'reload schema';
commit;
