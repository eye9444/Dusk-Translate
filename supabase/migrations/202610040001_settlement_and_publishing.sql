-- Previously saved output can settle after a capacity downgrade. New attempts
-- and heartbeats still require an editable project and active membership.
create or replace function public.translation_quota(target_actor uuid,target_environment text,target_project uuid,operation text,
 attempt_id uuid default null,target_chapter text default null,target_output_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if target_environment is distinct from (select environment from public.launch_configuration where singleton) then raise exception 'Billing environment mismatch'; end if;
 if not public.project_actor_can_edit(target_project,target_actor) then
   if operation not in ('commit','release') or not exists(select 1 from public.translation_attempts a
     where a.id=attempt_id and a.actor_id=target_actor and a.project_id=target_project and a.environment=target_environment)
   then raise exception 'This project is read-only or access is suspended'; end if;
 end if;
 return public.translation_quota_accounting(target_actor,target_environment,target_project,operation,attempt_id,target_chapter,target_output_hash);
end; $$;

create function public.reader_link_status(target_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.projects; link public.project_reader_links; editor boolean; manager boolean; teams boolean;
begin
 select * into p from public.projects where id=target_project;
 if not found or not public.can_access_project(target_project) then raise exception 'Project access required'; end if;
 select * into link from public.project_reader_links where project_id=target_project;
 editor:=public.project_actor_can_edit(target_project,auth.uid());
 manager:=p.owner_id=auth.uid() or (link.created_by=auth.uid() and editor);
 teams:=public.launch_tier(auth.uid())='advanced';
 return jsonb_build_object('token',case when link.revoked_at is null then link.token else null end,
   'active',coalesce(public.active_reader_project(link.token)=target_project,false),
   'commentsEnabled',coalesce(link.comments_enabled,false),'canManage',coalesce(manager,false),
   'canCreate',editor and teams and (link.project_id is null or coalesce(manager,false)),
   'canEnableComments',coalesce(manager,false) and teams,'requiresTeams',not teams);
end; $$;

create or replace function public.enable_public_reader_link(target_project_id uuid)
returns table(token uuid) language plpgsql security definer set search_path='' as $$
declare previous public.project_reader_links;
begin
 if not public.project_actor_can_edit(target_project_id,auth.uid()) then raise exception 'Editor access required'; end if;
 if public.launch_tier(auth.uid())<>'advanced' then raise exception 'Reader links require your own Teams plan'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_project_id::text||':reader-link',0));
 select * into previous from public.project_reader_links where project_id=target_project_id for update;
 if found and previous.created_by<>auth.uid() and not exists(select 1 from public.projects where id=target_project_id and owner_id=auth.uid())
 then raise exception 'Only the owner or publishing editor can change this link'; end if;
 return query insert into public.project_reader_links(project_id,created_by) values(target_project_id,auth.uid())
 on conflict(project_id) do update set
 token=case when project_reader_links.revoked_at is not null then gen_random_uuid() else project_reader_links.token end,
 created_by=auth.uid(),revoked_at=null returning project_reader_links.token;
end; $$;

create or replace function public.disable_public_reader_link(target_project_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare old_token uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(target_project_id::text||':reader-link',0));
 if not exists(select 1 from public.projects p left join public.project_reader_links l on l.project_id=p.id
 where p.id=target_project_id and (p.owner_id=auth.uid() or (l.created_by=auth.uid() and public.project_actor_can_edit(p.id,auth.uid()))))
 then raise exception 'Only the owner or publishing editor can revoke a link'; end if;
 update public.project_reader_links set revoked_at=coalesce(revoked_at,now()) where project_id=target_project_id returning token into old_token;
 if old_token is not null then insert into public.reader_link_revocations(token,project_id) values(old_token,target_project_id) on conflict do nothing; end if;
end; $$;
revoke all on function public.reader_link_status(uuid) from public;
grant execute on function public.reader_link_status(uuid) to authenticated;
