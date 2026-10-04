create or replace function public.active_reader_project(reader_token uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select l.project_id from public.project_reader_links l
 where l.token=reader_token and l.revoked_at is null
 and public.launch_tier(l.created_by)='advanced'
 and public.project_actor_can_edit(l.project_id,l.created_by);
$$;
create or replace function public.enable_public_reader_link(target_project_id uuid)
returns table(token uuid) language plpgsql security definer set search_path='' as $$
begin
 if not public.project_actor_can_edit(target_project_id,auth.uid()) then raise exception 'Editor access required'; end if;
 if public.launch_tier(auth.uid())<>'advanced' then raise exception 'Reader links require your own Teams plan'; end if;
 return query insert into public.project_reader_links(project_id,created_by) values(target_project_id,auth.uid())
 on conflict(project_id) do update set
 token=case when project_reader_links.revoked_at is not null then gen_random_uuid() else project_reader_links.token end,
 created_by=auth.uid(),revoked_at=null returning project_reader_links.token;
end; $$;
create or replace function public.get_public_reader_link(target_project_id uuid) returns table(token uuid)
language sql security definer set search_path='' as $$
 select l.token from public.project_reader_links l
 where l.project_id=target_project_id and public.project_actor_can_read_document(target_project_id,auth.uid()) and l.revoked_at is null;
$$;
create or replace function public.can_read_shared_book(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_reader_links l join public.projects p on p.id=l.project_id
 where p.file_path=object_name and p.id=public.active_reader_project(l.token)
 and l.token::text=coalesce((coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-dusk-share-token'),''));
$$;
create or replace function public.set_reader_commenting(target_project uuid,enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.project_reader_links l join public.projects p on p.id=l.project_id
 where p.id=target_project and (p.owner_id=auth.uid() or (l.created_by=auth.uid() and public.project_actor_can_edit(p.id,auth.uid()))))
 then raise exception 'Only the owner or publishing editor can change commenting'; end if;
 if enabled and public.launch_tier(auth.uid())<>'advanced' then raise exception 'Reader comments require your own Teams plan'; end if;
 update public.project_reader_links set comments_enabled=enabled where project_id=target_project;
end; $$;

create function public.set_project_instructions(target_project uuid,instructions text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.project_actor_can_edit(target_project,auth.uid()) then raise exception 'Editor access required'; end if;
 if public.launch_tier(auth.uid())<>'advanced' then raise exception 'Custom prompts require your own Teams plan'; end if;
 if instructions is null or char_length(instructions)>10000 then raise exception 'Instructions must be at most 10000 characters'; end if;
 insert into public.project_launch_preferences(project_id,custom_instructions) values(target_project,instructions)
 on conflict(project_id) do update set custom_instructions=excluded.custom_instructions;
end; $$;
revoke all on function public.set_project_instructions(uuid,text) from public;
grant execute on function public.set_project_instructions(uuid,text) to authenticated;
