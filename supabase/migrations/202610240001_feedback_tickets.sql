alter table public.feedback_reports
  add column status text not null default 'new' check(status in ('new','accepted','standby','rejected')),
  add column rejection_reason text not null default '',
  add column updated_at timestamptz not null default now(),
  add column admin_seen_at timestamptz,
  add column reporter_seen_at timestamptz not null default now();

create table public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.feedback_reports(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  from_admin boolean not null,
  body text not null check(char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index feedback_messages_report_idx on public.feedback_messages(report_id,created_at);
alter table public.feedback_messages enable row level security;
revoke all on public.feedback_messages from public,anon,authenticated;

create function public.feedback_tickets()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_data order by updated_at desc),'[]'::jsonb) from (
   select r.updated_at,jsonb_build_object('id',r.id,'feedback_type',r.feedback_type,
     'description',r.description,'screenshot_path',r.screenshot_path,'created_at',r.created_at,
     'status',r.status,'rejection_reason',r.rejection_reason,
     'reporter_email',case when public.is_feedback_admin() then u.email else null end,
     'unread',r.updated_at>coalesce(case when public.is_feedback_admin() then r.admin_seen_at else r.reporter_seen_at end,'-infinity'::timestamptz)) row_data
   from public.feedback_reports r join auth.users u on u.id=r.reporter_id
   where r.deleted_at is null and (r.reporter_id=auth.uid() or public.is_feedback_admin())
   order by r.updated_at desc limit 200
 ) tickets;
$$;

create function public.feedback_ticket_action(report_id uuid,operation text,body_text text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare report public.feedback_reports; admin boolean:=public.is_feedback_admin(); actor uuid:=auth.uid();
begin
 select * into report from public.feedback_reports where id=report_id and deleted_at is null for update;
 if actor is null or report.id is null or not(admin or report.reporter_id=actor) then raise exception 'Permission denied'; end if;
 if operation='reply' then
   if char_length(btrim(body_text)) not between 1 and 5000 then raise exception 'Replies must be between 1 and 5,000 characters'; end if;
   if (select count(*) from public.feedback_messages where author_id=actor and created_at>now()-interval '1 hour')>=60 then raise exception 'Please wait before sending more replies'; end if;
   insert into public.feedback_messages(report_id,author_id,from_admin,body) values(report.id,actor,admin,btrim(body_text));
   update public.feedback_reports set updated_at=now() where id=report.id;
 elsif operation in ('new','accepted','standby','rejected') then
   if not admin then raise exception 'Permission denied'; end if;
   if char_length(body_text)>5000 or (operation='rejected' and char_length(btrim(body_text))<10) then raise exception 'Provide a rejection reason of 10 to 5,000 characters'; end if;
   update public.feedback_reports set status=operation,rejection_reason=case when operation='rejected' then btrim(body_text) else '' end,updated_at=now() where id=report.id;
   insert into public.feedback_messages(report_id,author_id,from_admin,body) values(report.id,actor,true,'Status: '||operation||case when btrim(body_text)<>'' then E'\n'||btrim(body_text) else '' end);
 elsif operation<>'read' then raise exception 'Unknown ticket action';
 end if;
 update public.feedback_reports set admin_seen_at=case when admin then now() else admin_seen_at end,
   reporter_seen_at=case when not admin then now() else reporter_seen_at end where id=report.id;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'from_admin',m.from_admin,'created_at',m.created_at) order by m.created_at,m.id),'[]'::jsonb)
   from public.feedback_messages m where m.report_id=report.id);
end;
$$;
revoke all on function public.feedback_tickets() from public,anon,authenticated;
revoke all on function public.feedback_ticket_action(uuid,text,text) from public,anon,authenticated;
grant execute on function public.feedback_tickets(), public.feedback_ticket_action(uuid,text,text) to authenticated;
create policy "Reporters read their feedback screenshots" on storage.objects for select to authenticated
using(bucket_id='feedback-screenshots' and (storage.foldername(name))[1]=auth.uid()::text);
