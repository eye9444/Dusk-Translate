-- Inbox deletion retains submission timestamps for abuse-rate accounting.
alter table public.feedback_reports add column if not exists deleted_at timestamptz;

create or replace function public.is_feedback_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.super_users s join auth.users u on u.id=s.user_id
    where s.user_id=(select auth.uid()) and lower(u.email)='ironhero109@gmail.com');
$$;

create or replace function public.list_feedback_inbox()
returns table(id uuid,feedback_type text,description text,screenshot_path text,created_at timestamptz,reporter_email text)
language sql stable security definer set search_path='' as $$
  select r.id,r.feedback_type,r.description,r.screenshot_path,r.created_at,u.email
  from public.feedback_reports r join auth.users u on u.id=r.reporter_id
  where public.is_feedback_admin() and r.deleted_at is null
  order by r.created_at desc limit 200;
$$;

create or replace function public.delete_feedback_report(report_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_feedback_admin() then raise exception 'Permission denied'; end if;
  update public.feedback_reports set deleted_at=now(),description='Deleted report',screenshot_path=null
  where id=report_id and deleted_at is null;
end;
$$;
revoke all on function public.delete_feedback_report(uuid) from public,anon,authenticated;
grant execute on function public.delete_feedback_report(uuid) to authenticated;
create policy "Founder deletes feedback screenshots" on storage.objects for delete to authenticated
using (bucket_id='feedback-screenshots' and public.is_feedback_admin());
