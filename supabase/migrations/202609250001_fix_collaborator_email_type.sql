-- Match the declared return type of the RPC to Supabase's varchar email column.
create or replace function public.list_project_collaborators(target_project_id uuid)
returns table(user_id uuid, email text, role text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects where id = target_project_id and owner_id = auth.uid()) then
    raise exception 'Only the project owner can view collaborator details.';
  end if;
  return query select collaborator.user_id, account.email::text, collaborator.role
  from public.project_collaborators collaborator
  join auth.users account on account.id = collaborator.user_id
  where collaborator.project_id = target_project_id
  order by collaborator.created_at;
end;
$$;
