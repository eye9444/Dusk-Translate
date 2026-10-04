create function public.account_cloud_capacity() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare tier text; projects jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 tier:=public.launch_tier(auth.uid());
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'archived',p.archived,
 'selected',public.project_editable(p.id)) order by p.created_at,p.id),'[]'::jsonb)
 into projects from public.projects p where p.owner_id=auth.uid();
 return jsonb_build_object('tier',tier,'limits',public.launch_limits(tier),'storageBytes',public.account_storage_bytes(auth.uid()),
 'reservedBytes',public.reserved_storage_bytes(auth.uid()),'projects',projects);
end; $$;
create function public.project_seat_selection(target_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare members jsonb; allowance integer;
begin
 if not exists(select 1 from public.projects where id=target_project and owner_id=auth.uid()) then raise exception 'Owner access required'; end if;
 allowance:=(public.launch_limits(public.launch_tier(auth.uid()))->>'seats')::int-1;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.user_id,'title',u.email,
 'selected',public.project_member_active(target_project,c.user_id)) order by c.created_at,c.user_id),'[]'::jsonb)
 into members from public.project_collaborators c join auth.users u on u.id=c.user_id where c.project_id=target_project;
 return jsonb_build_object('allowance',allowance,'members',members);
end; $$;
revoke all on function public.account_cloud_capacity(),public.project_seat_selection(uuid) from public;
grant execute on function public.account_cloud_capacity(),public.project_seat_selection(uuid) to authenticated;
