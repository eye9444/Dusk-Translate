-- Invitations are private until accepted. Existing members may be viewers or
-- editors; owners remain the only people who can manage access.
alter table public.project_collaborators drop constraint if exists project_collaborators_role_check;
alter table public.project_collaborators add constraint project_collaborators_role_check check (role in ('viewer','editor'));

drop policy if exists "Editors update shared projects" on public.projects;
create policy "Editors update shared projects" on public.projects for update to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.project_collaborators
    where project_id = id and user_id = auth.uid() and role = 'editor'
  ))
  with check (owner_id = auth.uid() or exists (
    select 1 from public.project_collaborators
    where project_id = id and user_id = auth.uid() and role = 'editor'
  ));

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and char_length(email) between 3 and 320),
  role text not null default 'editor' check (role in ('viewer','editor')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index project_invitations_project_email on public.project_invitations(project_id, email);
create index project_invitations_email on public.project_invitations(email, created_at desc);
alter table public.project_invitations enable row level security;
revoke all on public.project_invitations from anon, authenticated;

create function public.create_project_invitations(target_project_id uuid, invitees jsonb)
returns table(email text, role text, outcome text)
language plpgsql security definer set search_path = '' as $$
declare invitee record; normalized_email text; owner_email text;
begin
  if not exists (select 1 from public.projects where id = target_project_id and owner_id = auth.uid()) then
    raise exception 'Only the project owner can invite collaborators.';
  end if;
  if jsonb_typeof(invitees) <> 'array' or jsonb_array_length(invitees) = 0 or jsonb_array_length(invitees) > 25 then
    raise exception 'Invite between 1 and 25 email addresses.';
  end if;
  select lower(users.email) into owner_email from auth.users users where users.id = auth.uid();
  for invitee in select * from jsonb_to_recordset(invitees) as x(email text, role text) loop
    normalized_email := lower(trim(invitee.email));
    if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Invalid email address.';
    end if;
    if invitee.role not in ('viewer','editor') then
      raise exception 'Unsupported access level.';
    end if;
    if normalized_email = owner_email then
      return query select normalized_email, invitee.role, 'owner';
    elsif exists (select 1 from public.project_collaborators where project_id = target_project_id and user_id = (select users.id from auth.users users where lower(users.email) = normalized_email limit 1)) then
      return query select normalized_email, invitee.role, 'already_member';
    else
      update public.project_invitations invitation set role = invitee.role, invited_by = auth.uid(), created_at = now()
        where invitation.project_id = target_project_id and invitation.email = normalized_email;
      if not found then
        insert into public.project_invitations(project_id,email,role,invited_by)
          values(target_project_id,normalized_email,invitee.role,auth.uid());
      end if;
      return query select normalized_email, invitee.role, 'invited';
    end if;
  end loop;
end;
$$;

create function public.list_project_invitations(target_project_id uuid)
returns table(id uuid, email text, role text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select invitation.id, invitation.email, invitation.role, invitation.created_at
  from public.project_invitations invitation
  where invitation.project_id = target_project_id
    and exists (select 1 from public.projects where projects.id = target_project_id and projects.owner_id = auth.uid())
  order by invitation.created_at desc;
$$;

create function public.revoke_project_invitation(target_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.project_invitations invitation
  where invitation.id = target_invitation_id
    and exists (select 1 from public.projects where projects.id = invitation.project_id and projects.owner_id = auth.uid());
  if not found then raise exception 'Only the project owner can revoke this invitation.'; end if;
end;
$$;

create function public.update_project_collaborator_role(target_project_id uuid, target_user_id uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if new_role not in ('viewer','editor') then raise exception 'Unsupported access level.'; end if;
  update public.project_collaborators collaborator set role = new_role
  where collaborator.project_id = target_project_id and collaborator.user_id = target_user_id
    and exists (select 1 from public.projects where projects.id = target_project_id and projects.owner_id = auth.uid());
  if not found then raise exception 'Only the project owner can change collaborator access.'; end if;
end;
$$;

create function public.list_my_project_invitations()
returns table(id uuid, project_id uuid, project_title text, inviter_name text, role text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select invitation.id, project.id, project.title,
    left(coalesce(nullif(inviter.raw_user_meta_data->>'full_name',''), nullif(inviter.raw_user_meta_data->>'name',''), split_part(inviter.email,'@',1), 'A collaborator'),80)::text,
    invitation.role, invitation.created_at
  from public.project_invitations invitation
  join public.projects project on project.id = invitation.project_id
  join auth.users invitee on invitee.id = auth.uid()
  join auth.users inviter on inviter.id = invitation.invited_by
  where invitation.email = lower(invitee.email)
  order by invitation.created_at desc;
$$;

create function public.respond_to_project_invitation(target_invitation_id uuid, accept_invitation boolean)
returns table(project_id uuid, accepted boolean)
language plpgsql security definer set search_path = '' as $$
declare invitation public.project_invitations%rowtype;
begin
  select * into invitation from public.project_invitations
    where id = target_invitation_id and email = (select lower(email) from auth.users where id = auth.uid())
    for update;
  if invitation.id is null then raise exception 'Invitation not found.'; end if;
  if accept_invitation then
    insert into public.project_collaborators(project_id,user_id,role,added_by)
      values(invitation.project_id,auth.uid(),invitation.role,invitation.invited_by)
      on conflict on constraint project_collaborators_pkey do update set role = excluded.role;
  end if;
  delete from public.project_invitations where id = invitation.id;
  return query select invitation.project_id, accept_invitation;
end;
$$;

revoke all on function public.create_project_invitations(uuid,jsonb) from public;
revoke all on function public.list_project_invitations(uuid) from public;
revoke all on function public.revoke_project_invitation(uuid) from public;
revoke all on function public.update_project_collaborator_role(uuid,uuid,text) from public;
revoke all on function public.list_my_project_invitations() from public;
revoke all on function public.respond_to_project_invitation(uuid,boolean) from public;
grant execute on function public.create_project_invitations(uuid,jsonb) to authenticated;
grant execute on function public.list_project_invitations(uuid) to authenticated;
grant execute on function public.revoke_project_invitation(uuid) to authenticated;
grant execute on function public.update_project_collaborator_role(uuid,uuid,text) to authenticated;
grant execute on function public.list_my_project_invitations() to authenticated;
grant execute on function public.respond_to_project_invitation(uuid,boolean) to authenticated;
