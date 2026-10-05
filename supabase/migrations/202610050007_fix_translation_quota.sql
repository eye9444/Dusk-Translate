-- Fix: translation_quota was requiring project_actor_can_edit (which includes
-- capacity/editable checks), blocking regular free accounts from translating.
-- Relax the check: owners and editors can always translate; capacity is only
-- enforced for cloud uploads (images), not translation text.
alter function public.translation_quota(uuid,text,uuid,text,uuid,text,text) rename to translation_quota_accounting;
revoke all on function public.translation_quota_accounting(uuid,text,uuid,text,uuid,text,text) from public, authenticated;
grant execute on function public.translation_quota_accounting(uuid,text,uuid,text,uuid,text,text) to service_role;

create function public.translation_quota(target_actor uuid,target_environment text,target_project uuid,operation text,
  attempt_id uuid default null,target_chapter text default null,target_output_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.projects; tier text;
begin
  select * into p from public.projects where id=target_project;
  if not found then raise exception 'Project access required'; end if;
  -- Owners and editors can always translate; others are denied.
  if p.owner_id<>target_actor and not exists(
    select 1 from public.project_collaborators where project_id=target_project and user_id=target_actor and role='editor'
  ) then raise exception 'Editor access required'; end if;
  if target_environment is distinct from (select environment from public.launch_configuration where singleton) then raise exception 'Billing environment mismatch'; end if;
  return public.translation_quota_accounting(target_actor,target_environment,target_project,operation,attempt_id,target_chapter,target_output_hash);
end; $$;
revoke all on function public.translation_quota(uuid,text,uuid,text,uuid,text,text) from public;
grant execute on function public.translation_quota(uuid,text,uuid,text,uuid,text,text) to service_role;
