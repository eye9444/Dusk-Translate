create table public.project_presence (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  location jsonb not null default '{}',
  seen_at timestamptz not null default now(),
  primary key(project_id, user_id, session_id)
);
alter table public.project_presence enable row level security;
revoke all on public.project_presence from anon, authenticated;

create function public.sync_project_presence(target_project_id uuid, tab_id uuid, cursor_state jsonb default '{}')
returns table(user_id uuid, display_name text, online boolean, location jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_project(target_project_id) then
    raise exception 'Project access required.';
  end if;
  if tab_id is null or cursor_state is null or jsonb_typeof(cursor_state) <> 'object'
     or octet_length(cursor_state::text) > 1024 then
    raise exception 'Invalid presence state.';
  end if;
  delete from public.project_presence p where p.project_id = target_project_id
    and p.seen_at < now() - interval '1 minute';
  insert into public.project_presence as p(project_id,user_id,session_id,location,seen_at)
    values(target_project_id,auth.uid(),tab_id,cursor_state,now())
    on conflict on constraint project_presence_pkey do update
    set location = excluded.location, seen_at = excluded.seen_at;
  return query
    with members as (
      select p.owner_id as id from public.projects p where p.id = target_project_id
      union select c.user_id from public.project_collaborators c where c.project_id = target_project_id
    )
    select m.id,
      left(coalesce(nullif(a.raw_user_meta_data->>'full_name',''), nullif(a.raw_user_meta_data->>'name',''), split_part(a.email,'@',1), 'Collaborator'),80)::text,
      coalesce(latest.seen_at > now() - interval '20 seconds',false),
      case when latest.seen_at > now() - interval '20 seconds' then latest.location else '{}'::jsonb end
    from members m join auth.users a on a.id = m.id
    left join lateral (
      select p.location,p.seen_at from public.project_presence p
      where p.project_id = target_project_id and p.user_id = m.id
      order by p.seen_at desc limit 1
    ) latest on true;
end;
$$;

create function public.leave_project_presence(target_project_id uuid, tab_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.project_presence p where p.project_id = target_project_id
    and p.user_id = auth.uid() and p.session_id = tab_id;
$$;
revoke all on function public.sync_project_presence(uuid,uuid,jsonb) from public;
revoke all on function public.leave_project_presence(uuid,uuid) from public;
grant execute on function public.sync_project_presence(uuid,uuid,jsonb) to authenticated;
grant execute on function public.leave_project_presence(uuid,uuid) to authenticated;
