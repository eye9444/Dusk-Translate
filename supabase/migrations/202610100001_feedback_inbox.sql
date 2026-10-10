-- Signed-in users can submit feedback. Only explicitly granted super users can
-- read the inbox or private screenshot objects.
create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('bug','idea','translation','account','other')),
  description text not null check (char_length(description) between 10 and 5000),
  screenshot_path text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_reports_created_at_idx on public.feedback_reports(created_at desc);
create index if not exists feedback_reports_reporter_created_idx on public.feedback_reports(reporter_id, created_at desc);
alter table public.feedback_reports enable row level security;
revoke all on public.feedback_reports from public, anon, authenticated;

create or replace function public.is_feedback_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.super_users where user_id=(select auth.uid()));
$$;

create or replace function public.submit_feedback(feedback_type text, feedback_description text, screenshot_path text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid; reporter uuid:=(select auth.uid());
begin
  if reporter is null then raise exception 'Sign in before sending feedback'; end if;
  if feedback_type not in ('bug','idea','translation','account','other') then raise exception 'Choose a feedback category'; end if;
  if char_length(btrim(feedback_description)) not between 10 and 5000 then raise exception 'Feedback must be between 10 and 5,000 characters'; end if;
  if screenshot_path is not null and (
    screenshot_path !~ ('^' || reporter::text || '/[0-9a-f-]+\.(png|jpg|webp)$')
    or not exists(select 1 from storage.objects where bucket_id='feedback-screenshots' and name=screenshot_path)
  ) then raise exception 'Screenshot could not be verified'; end if;
  if (select count(*) from public.feedback_reports where reporter_id=reporter and created_at>now()-interval '1 hour')>=10 then
    raise exception 'You have sent several reports recently. Please try again in an hour.';
  end if;
  insert into public.feedback_reports(reporter_id,feedback_type,description,screenshot_path)
  values(reporter,feedback_type,btrim(feedback_description),screenshot_path) returning id into report_id;
  return report_id;
end;
$$;

create or replace function public.list_feedback_inbox()
returns table(id uuid,feedback_type text,description text,screenshot_path text,created_at timestamptz,reporter_email text)
language sql stable security definer set search_path='' as $$
  select report.id,report.feedback_type,report.description,report.screenshot_path,report.created_at,user_row.email
  from public.feedback_reports report join auth.users user_row on user_row.id=report.reporter_id
  where public.is_feedback_admin()
  order by report.created_at desc limit 200;
$$;

revoke all on function public.is_feedback_admin() from public, anon;
revoke all on function public.submit_feedback(text,text,text) from public, anon;
revoke all on function public.list_feedback_inbox() from public, anon;
grant execute on function public.is_feedback_admin() to authenticated, service_role;
grant execute on function public.submit_feedback(text,text,text) to authenticated, service_role;
grant execute on function public.list_feedback_inbox() to authenticated, service_role;

insert into storage.buckets(id,name,public,file_size_limit)
values('feedback-screenshots','feedback-screenshots',false,5242880)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

create policy "Reporters upload feedback screenshots" on storage.objects for insert to authenticated
with check (bucket_id='feedback-screenshots' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Feedback admins read screenshots" on storage.objects for select to authenticated
using (bucket_id='feedback-screenshots' and public.is_feedback_admin());
