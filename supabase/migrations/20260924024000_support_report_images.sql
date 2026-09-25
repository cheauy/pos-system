begin;
alter table public.platform_support_reports
  add column if not exists reason text,
  add column if not exists image_path text;
alter table public.platform_support_reports drop constraint if exists platform_support_reports_description_check;
alter table public.platform_support_reports add constraint platform_support_reports_description_check check(char_length(description)<=6000);
alter table public.platform_support_reports drop constraint if exists platform_support_reports_reason_check;
alter table public.platform_support_reports add constraint platform_support_reports_reason_check
  check(reason is null or reason in ('Bug or Technical Issue','Billing or Payment','Account & User Access','Something Else'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('support-report-images','support-report-images',false,5242880,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
notify pgrst,'reload schema';
commit;
