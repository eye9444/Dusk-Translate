alter table public.project_documents add column update_revision bigint not null default 0;
create function public.project_actor_can_read_document(target_project uuid,actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p where p.id=target_project and (p.owner_id=actor
 or (public.project_member_active(target_project,actor) and exists(select 1 from public.project_collaborators c
 where c.project_id=p.id and c.user_id=actor and c.role='editor'))));
$$;
drop policy "Editors read working documents" on public.project_documents;
drop policy "Editors read working updates" on public.project_document_updates;
create policy "Editors preserve working documents" on public.project_documents for select to authenticated
 using(public.project_actor_can_read_document(project_id,auth.uid()));
create policy "Editors preserve working updates" on public.project_document_updates for select to authenticated
 using(public.project_actor_can_read_document(project_id,auth.uid()));
revoke execute on function public.initialize_project_document(uuid,bytea),public.append_project_document_update(uuid,uuid,bytea) from authenticated;

create function public.initialize_checked_document(actor uuid,target_project uuid,initial_state bytea) returns bytea
language plpgsql security definer set search_path='' as $$
declare seed_state bytea;
begin
 if not public.project_actor_can_read_document(target_project,actor) then raise exception 'Document access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended((select owner_id::text from public.projects where id=target_project)||':cloud',0));
 select seed into seed_state from public.project_documents where project_id=target_project;
 if seed_state is not null then return seed_state; end if;
 if not public.project_actor_can_edit(target_project,actor) then return initial_state; end if;
 insert into public.project_documents(project_id,seed) values(target_project,initial_state);
 return initial_state;
end; $$;
create function public.append_checked_document(actor uuid,target_project uuid,operation_id uuid,update_bytes bytea,expected_revision bigint,validated_tier text)
returns void language plpgsql security definer set search_path='' as $$
declare actual_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended((select owner_id::text from public.projects where id=target_project)||':cloud',0));
 if not public.project_actor_can_edit(target_project,actor) then raise exception 'Editor access required'; end if;
 if public.launch_tier((select owner_id from public.projects where id=target_project)) is distinct from validated_tier then raise exception 'Plan changed; retry with current permissions'; end if;
 select update_revision into actual_revision from public.project_documents where project_id=target_project for update;
 if exists(select 1 from public.project_document_updates where project_id=target_project and update_id=operation_id) then
   if not exists(select 1 from public.project_document_updates where project_id=target_project and update_id=operation_id and author_id=actor and payload=update_bytes)
   then raise exception 'Operation identifier already used'; end if;
   return;
 end if;
 if actual_revision is distinct from expected_revision then raise exception 'Document changed; retry with current state'; end if;
 if (select coalesce(sum(octet_length(payload)),0) from public.project_document_updates where project_id=target_project)+octet_length(update_bytes)>50000000
 then raise exception 'Document update capacity reached; export a backup'; end if;
 insert into public.project_document_updates(project_id,update_id,author_id,payload) values(target_project,operation_id,actor,update_bytes);
 update public.project_documents set update_revision=update_revision+1 where project_id=target_project;
end; $$;
revoke all on function public.project_actor_can_read_document(uuid,uuid),public.initialize_checked_document(uuid,uuid,bytea),public.append_checked_document(uuid,uuid,uuid,bytea,bigint,text) from public;
grant execute on function public.project_actor_can_read_document(uuid,uuid) to authenticated,service_role;
grant execute on function public.initialize_checked_document(uuid,uuid,bytea),public.append_checked_document(uuid,uuid,uuid,bytea,bigint,text) to service_role;
