-- New collaboration clients share one seed; independent seeds duplicate text.
create table public.project_documents (
  project_id uuid primary key references public.projects(id) on delete cascade,
  seed bytea not null check (octet_length(seed) between 1 and 30000000),
  created_at timestamptz not null default now()
);
create table public.project_document_updates (
  project_id uuid not null references public.project_documents(project_id) on delete cascade,
  update_id uuid not null,
  author_id uuid not null references auth.users(id),
  payload bytea not null check (octet_length(payload) between 1 and 1048576),
  created_at timestamptz not null default now(),
  primary key(project_id, update_id)
);
alter table public.project_documents enable row level security;
alter table public.project_document_updates enable row level security;
revoke all on public.project_documents, public.project_document_updates from anon, authenticated;
grant select on public.project_documents, public.project_document_updates to authenticated;

create function public.can_edit_document(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.projects p where p.id = target_project_id and
    (p.owner_id = auth.uid() or exists(select 1 from public.project_collaborators c
      where c.project_id = p.id and c.user_id = auth.uid() and c.role = 'editor')));
$$;
revoke all on function public.can_edit_document(uuid) from public;
grant execute on function public.can_edit_document(uuid) to authenticated;

-- Working documents can include private reference notes: only editors read them.
create policy "Editors read working documents" on public.project_documents
  for select to authenticated using (public.can_edit_document(project_id));
create policy "Editors read working updates" on public.project_document_updates
  for select to authenticated using (public.can_edit_document(project_id));

create function public.initialize_project_document(target_project_id uuid, initial_state bytea)
returns bytea language plpgsql security definer set search_path = '' as $$
declare canonical bytea;
begin
  if not public.can_edit_document(target_project_id) then raise exception 'Editor access required.'; end if;
  insert into public.project_documents(project_id, seed) values(target_project_id, initial_state)
    on conflict(project_id) do nothing;
  select seed into canonical from public.project_documents where project_id = target_project_id;
  return canonical;
end;
$$;

create function public.append_project_document_update(target_project_id uuid, operation_id uuid, update_bytes bytea)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize quota accounting for this project, including concurrent retries.
  perform 1 from public.projects where id = target_project_id for update;
  if not public.can_edit_document(target_project_id) then raise exception 'Editor access required.'; end if;
  if exists(select 1 from public.project_document_updates where project_id = target_project_id and update_id = operation_id) then
    if not exists(select 1 from public.project_document_updates where project_id = target_project_id and update_id = operation_id and author_id = auth.uid() and payload = update_bytes) then
      raise exception 'Operation identifier already used.';
    end if;
    return;
  end if;
  if (select coalesce(sum(octet_length(payload)),0) from public.project_document_updates where project_id = target_project_id) + octet_length(update_bytes) > 50000000 then
    raise exception 'Document update capacity reached; export a backup.';
  end if;
  insert into public.project_document_updates(project_id, update_id, author_id, payload)
    values(target_project_id, operation_id, auth.uid(), update_bytes);
end;
$$;
revoke all on function public.initialize_project_document(uuid,bytea) from public;
revoke all on function public.append_project_document_update(uuid,uuid,bytea) from public;
grant execute on function public.initialize_project_document(uuid,bytea) to authenticated;
grant execute on function public.append_project_document_update(uuid,uuid,bytea) to authenticated;

-- Construct a positive allowlist, never return the private working snapshot.
create function public.reader_snapshot(value jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when value is null then null else jsonb_build_object(
    'novel', jsonb_build_object(
      'chapters', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c->'id', 'text', c->'text', 'jp_char_count', c->'jp_char_count', 'xhtmlPath', c->'xhtmlPath'
      )) from jsonb_array_elements(value->'novel'->'chapters') c), '[]'::jsonb),
      '_epubOpfPath', value->'novel'->'_epubOpfPath',
      '_epubOpfDir', value->'novel'->'_epubOpfDir'
    ),
    'translations', value->'translations',
    'exportExcluded', value->'exportExcluded'
  ) end;
$$;
revoke all on function public.reader_snapshot(jsonb) from public;

create or replace function public.open_public_reader_link(reader_token uuid)
returns table(project_id uuid, title text, file_name text, file_path text, snapshot jsonb)
language sql security definer set search_path = '' as $$
  select project.id, project.title, project.file_name, project.file_path, public.reader_snapshot(project.snapshot)
  from public.project_reader_links reader_link
  join public.projects project on project.id = reader_link.project_id
  where reader_link.token = reader_token;
$$;
