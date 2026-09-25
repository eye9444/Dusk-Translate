-- A revocable, high-entropy token grants read-only EPUB access without making
-- project metadata or the books bucket public.
create table public.project_reader_links (
  project_id uuid primary key references public.projects(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.project_reader_links enable row level security;
revoke all on public.project_reader_links from anon, authenticated;

create function public.enable_public_reader_link(target_project_id uuid)
returns table(token uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects where id = target_project_id and owner_id = auth.uid()) then
    raise exception 'Only the project owner can create a reader link.';
  end if;
  return query
    insert into public.project_reader_links(project_id, created_by)
      values(target_project_id, auth.uid())
    on conflict (project_id) do update set created_by = excluded.created_by
    returning project_reader_links.token;
end;
$$;

create function public.get_public_reader_link(target_project_id uuid)
returns table(token uuid)
language sql security definer set search_path = '' as $$
  select reader_link.token
  from public.project_reader_links reader_link
  join public.projects project on project.id = reader_link.project_id
  where reader_link.project_id = target_project_id and project.owner_id = auth.uid();
$$;

create function public.disable_public_reader_link(target_project_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.project_reader_links reader_link
  where reader_link.project_id = target_project_id
    and exists (select 1 from public.projects project where project.id = target_project_id and project.owner_id = auth.uid());
  if not found then raise exception 'Only the project owner can disable this reader link.'; end if;
end;
$$;

create function public.open_public_reader_link(reader_token uuid)
returns table(project_id uuid, title text, file_name text, file_path text, snapshot jsonb)
language sql security definer set search_path = '' as $$
  select project.id, project.title, project.file_name, project.file_path, project.snapshot
  from public.project_reader_links reader_link
  join public.projects project on project.id = reader_link.project_id
  where reader_link.token = reader_token;
$$;

create function public.can_read_shared_book(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.project_reader_links reader_link
    join public.projects project on project.id = reader_link.project_id
    where project.file_path = object_name
      and reader_link.token::text = coalesce(
        (coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-dusk-share-token'),
        ''
      )
  );
$$;

grant select on storage.objects to anon;
create policy "Shared reader link downloads" on storage.objects for select to anon
  using (bucket_id = 'books' and public.can_read_shared_book(name));

revoke all on function public.enable_public_reader_link(uuid) from public;
revoke all on function public.get_public_reader_link(uuid) from public;
revoke all on function public.disable_public_reader_link(uuid) from public;
revoke all on function public.open_public_reader_link(uuid) from public;
revoke all on function public.can_read_shared_book(text) from public;
grant execute on function public.enable_public_reader_link(uuid) to authenticated;
grant execute on function public.get_public_reader_link(uuid) to authenticated;
grant execute on function public.disable_public_reader_link(uuid) to authenticated;
grant execute on function public.open_public_reader_link(uuid) to anon, authenticated;
grant execute on function public.can_read_shared_book(text) to anon, authenticated;
