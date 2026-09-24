-- Project sharing is deliberately owner-managed. Editors can work on a shared
-- snapshot, but cannot transfer ownership, invite others, or delete the book.
create table public.project_collaborators (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor')),
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_collaborators_user on public.project_collaborators(user_id, project_id);
alter table public.project_collaborators enable row level security;
revoke all on public.project_collaborators from anon;
grant select on public.project_collaborators to authenticated;

create function public.can_access_project(target_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects where id = target_project_id and owner_id = auth.uid())
      or exists (select 1 from public.project_collaborators where project_id = target_project_id and user_id = auth.uid());
$$;
revoke all on function public.can_access_project(uuid) from public;
grant execute on function public.can_access_project(uuid) to authenticated;

create policy "Members read shared projects" on public.projects for select to authenticated
  using (public.can_access_project(id));
create policy "Editors update shared projects" on public.projects for update to authenticated
  using (owner_id = auth.uid() or exists (select 1 from public.project_collaborators where project_id = id and user_id = auth.uid() and role = 'editor'))
  with check (owner_id = auth.uid() or exists (select 1 from public.project_collaborators where project_id = id and user_id = auth.uid() and role = 'editor'));
create policy "Members read collaborator list" on public.project_collaborators for select to authenticated
  using (public.can_access_project(project_id));

-- Original books remain immutable after creation, but every member must be
-- able to download the owner's original EPUB to read and edit the project.
create function public.can_access_project_file(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects
    where id::text = split_part(object_name, '/', 2)
      and public.can_access_project(id)
  );
$$;
revoke all on function public.can_access_project_file(text) from public;
grant execute on function public.can_access_project_file(text) to authenticated;
create policy "Members read shared books" on storage.objects for select to authenticated
  using (bucket_id = 'books' and public.can_access_project_file(name));

create function public.share_project(target_project_id uuid, collaborator_email text, collaborator_role text default 'editor')
returns table(user_id uuid, role text)
language plpgsql security definer set search_path = '' as $$
declare target_user_id uuid;
begin
  if not exists (select 1 from public.projects where id = target_project_id and owner_id = auth.uid()) then
    raise exception 'Only the project owner can add collaborators.';
  end if;
  if collaborator_role <> 'editor' then
    raise exception 'Unsupported collaborator role.';
  end if;
  select id into target_user_id from auth.users where lower(email) = lower(trim(collaborator_email)) limit 1;
  if target_user_id is null then
    raise exception 'That email does not have a DuskTranslate account yet.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You already own this project.';
  end if;
  insert into public.project_collaborators(project_id, user_id, role, added_by)
  values (target_project_id, target_user_id, collaborator_role, auth.uid())
  on conflict on constraint project_collaborators_pkey do update set role = excluded.role;
  return query select target_user_id, collaborator_role;
end;
$$;
create function public.list_project_collaborators(target_project_id uuid)
returns table(user_id uuid, email text, role text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects where id = target_project_id and owner_id = auth.uid()) then
    raise exception 'Only the project owner can view collaborator details.';
  end if;
  return query select collaborator.user_id, account.email, collaborator.role
  from public.project_collaborators collaborator
  join auth.users account on account.id = collaborator.user_id
  where collaborator.project_id = target_project_id
  order by collaborator.created_at;
end;
$$;
create function public.remove_project_collaborator(target_project_id uuid, target_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects where id = target_project_id and owner_id = auth.uid()) then
    raise exception 'Only the project owner can remove collaborators.';
  end if;
  delete from public.project_collaborators where project_id = target_project_id and user_id = target_user_id;
end;
$$;
revoke all on function public.share_project(uuid, text, text) from public;
revoke all on function public.list_project_collaborators(uuid) from public;
revoke all on function public.remove_project_collaborator(uuid, uuid) from public;
grant execute on function public.share_project(uuid, text, text) to authenticated;
grant execute on function public.list_project_collaborators(uuid) to authenticated;
grant execute on function public.remove_project_collaborator(uuid, uuid) to authenticated;
