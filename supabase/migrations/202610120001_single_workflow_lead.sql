-- Preserve exactly one authoritative Lead when a project appoints a replacement.
create or replace function public.configure_project_workflow(target_project uuid,workflow_enabled boolean,proofreader_enabled boolean,qc_enabled boolean,new_lead uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner uuid;
begin
 select owner_id into owner from public.projects where id=target_project;
 if owner is distinct from actor then raise exception 'Only the project owner can configure workflow'; end if;
 if public.launch_tier(actor)<>'advanced' then raise exception 'Team workflow requires Teams'; end if;
 if new_lead is not null and new_lead<>owner and not exists(select 1 from public.project_collaborators where project_id=target_project and user_id=new_lead and role='editor') then raise exception 'Lead must be an editor'; end if;
 insert into public.project_workflows(project_id,enabled,lead_id,proofreader_enabled,qc_enabled)
 values(target_project,workflow_enabled,coalesce(new_lead,owner),proofreader_enabled,qc_enabled)
 on conflict(project_id) do update set enabled=excluded.enabled,lead_id=excluded.lead_id,proofreader_enabled=excluded.proofreader_enabled,qc_enabled=excluded.qc_enabled,updated_at=now();
 update public.project_workflow_members set workflow_role='translator',assigned_by=actor
 where project_id=target_project and workflow_role='lead' and user_id<>coalesce(new_lead,owner);
 insert into public.project_workflow_members(project_id,user_id,workflow_role,assigned_by) values(target_project,coalesce(new_lead,owner),'lead',actor)
 on conflict(project_id,user_id) do update set workflow_role='lead',assigned_by=actor;
end; $$;

create or replace function public.set_workflow_member_role(target_project uuid,target_user uuid,new_role text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if public.workflow_role_for(target_project,actor)<>'lead' then raise exception 'Lead access required'; end if;
 if new_role not in ('translator','proofreader','qc','lead') then raise exception 'Invalid workflow role'; end if;
 if new_role<>'lead' and exists(select 1 from public.project_workflows where project_id=target_project and lead_id=target_user) then raise exception 'Appoint another Lead before changing this role'; end if;
 if public.launch_tier(target_user)<>'advanced' then raise exception 'Every workflow member needs Teams'; end if;
 if not exists(select 1 from public.projects where id=target_project and owner_id=target_user) and not exists(select 1 from public.project_collaborators where project_id=target_project and user_id=target_user and role='editor') then raise exception 'Workflow members must be project editors'; end if;
 if new_role='lead' then
   update public.project_workflow_members set workflow_role='translator',assigned_by=actor where project_id=target_project and workflow_role='lead' and user_id<>target_user;
 end if;
 insert into public.project_workflow_members(project_id,user_id,workflow_role,assigned_by) values(target_project,target_user,new_role,actor)
 on conflict(project_id,user_id) do update set workflow_role=excluded.workflow_role,assigned_by=actor;
 if new_role='lead' then update public.project_workflows set lead_id=target_user,updated_at=now() where project_id=target_project; end if;
end; $$;

revoke all on function public.configure_project_workflow(uuid,boolean,boolean,boolean,uuid),public.set_workflow_member_role(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.configure_project_workflow(uuid,boolean,boolean,boolean,uuid),public.set_workflow_member_role(uuid,uuid,text) to authenticated;
