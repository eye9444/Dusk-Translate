-- Private EPUB image replacements. Run after 202610010002_collaborative_documents.sql.
create table public.project_image_assets (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  epub_path text not null check (char_length(epub_path) between 1 and 2000 and epub_path !~ '[[:cntrl:]]'),
  original_bytes bigint not null check (original_bytes between 1 and 52428800),
  original_mime text not null check (original_mime in ('image/png','image/jpeg','image/webp')),
  replacement_path text,
  replacement_bytes bigint check (replacement_bytes between 1 and 52428800),
  replacement_mime text check (replacement_mime in ('image/png','image/jpeg','image/webp')),
  width integer check (width between 1 and 8192),
  height integer check (height between 1 and 8192),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(project_id, epub_path),
  check (replacement_path is null or replacement_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/images/[0-9a-f-]{36}/replacement\.(png|jpg|webp)$'),
  check (replacement_path is null or (replacement_bytes is not null and replacement_mime is not null and width is not null and height is not null)),
  check (replacement_bytes is null or replacement_bytes <= least(original_bytes + 10485760, 52428800))
);
create index project_image_assets_project on public.project_image_assets(project_id, epub_path);
alter table public.project_image_assets enable row level security;
revoke all on public.project_image_assets from anon, authenticated;
grant select on public.project_image_assets to authenticated;
create policy "Editors read project images" on public.project_image_assets
  for select to authenticated using (public.can_edit_document(project_id));

create function public.register_project_image(
  target_project_id uuid, image_id uuid, image_epub_path text,
  image_original_bytes bigint, image_original_mime text
) returns public.project_image_assets
language plpgsql security definer set search_path = '' as $$
declare result public.project_image_assets;
begin
  if not public.can_edit_document(target_project_id) then raise exception 'Editor access required.'; end if;
  if image_epub_path is null or char_length(image_epub_path) not between 1 and 2000 or image_epub_path ~ '[[:cntrl:]]'
    or image_original_bytes not between 1 and 52428800
    or image_original_mime not in ('image/png','image/jpeg','image/webp') then
    raise exception 'Invalid original image metadata.';
  end if;
  insert into public.project_image_assets(id,project_id,epub_path,original_bytes,original_mime)
    values(image_id,target_project_id,image_epub_path,image_original_bytes,image_original_mime)
    on conflict(project_id,epub_path) do nothing;
  select * into result from public.project_image_assets where project_id=target_project_id and epub_path=image_epub_path;
  if result.id <> image_id or result.original_bytes <> image_original_bytes or result.original_mime <> image_original_mime then
    raise exception 'Original image metadata cannot be changed.';
  end if;
  return result;
end;
$$;

create function public.can_upload_project_image(object_name text, object_metadata jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.project_image_assets image
    join public.projects project on project.id=image.project_id
    where object_name = project.owner_id::text || '/' || image.project_id::text || '/images/' || image.id::text ||
      case object_metadata->>'mimetype'
        when 'image/png' then '/replacement.png'
        when 'image/jpeg' then '/replacement.jpg'
        when 'image/webp' then '/replacement.webp'
        else '/invalid'
      end
      and public.can_edit_document(image.project_id)
      and coalesce((object_metadata->>'size')::bigint,0) between 1 and least(image.original_bytes + 10485760,52428800)
  );
$$;

create function public.set_project_image_replacement(
  target_project_id uuid, image_id uuid, object_name text,
  image_bytes bigint, image_mime text, image_width integer, image_height integer
) returns public.project_image_assets
language plpgsql security definer set search_path = '' as $$
declare result public.project_image_assets;
begin
  if not public.can_edit_document(target_project_id) then raise exception 'Editor access required.'; end if;
  if image_width not between 1 and 8192 or image_height not between 1 and 8192
    or image_width::bigint * image_height::bigint > 20000000 then raise exception 'Replacement image dimensions are too large.'; end if;
  if not exists(select 1 from storage.objects object where object.bucket_id='books' and object.name=object_name
    and public.can_upload_project_image(object.name,object.metadata)
    and coalesce((object.metadata->>'size')::bigint,0)=image_bytes
    and object.metadata->>'mimetype'=image_mime) then raise exception 'Replacement object is missing or invalid.'; end if;
  update public.project_image_assets set replacement_path=object_name,replacement_bytes=image_bytes,replacement_mime=image_mime,
    width=image_width,height=image_height,updated_by=auth.uid(),updated_at=now()
    where id=image_id and project_id=target_project_id returning * into result;
  if result.id is null then raise exception 'Image asset not found.'; end if;
  return result;
end;
$$;

create function public.clear_project_image_replacement(target_project_id uuid, image_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare old_path text;
begin
  if not public.can_edit_document(target_project_id) then raise exception 'Editor access required.'; end if;
  select replacement_path into old_path from public.project_image_assets where id=image_id and project_id=target_project_id;
  update public.project_image_assets set replacement_path=null,replacement_bytes=null,replacement_mime=null,width=null,height=null,
    updated_by=auth.uid(),updated_at=now() where id=image_id and project_id=target_project_id;
  return old_path;
end;
$$;

revoke all on function public.register_project_image(uuid,uuid,text,bigint,text) from public;
revoke all on function public.can_upload_project_image(text,jsonb) from public;
revoke all on function public.set_project_image_replacement(uuid,uuid,text,bigint,text,integer,integer) from public;
revoke all on function public.clear_project_image_replacement(uuid,uuid) from public;
grant execute on function public.register_project_image(uuid,uuid,text,bigint,text) to authenticated;
grant execute on function public.can_upload_project_image(text,jsonb) to authenticated;
grant execute on function public.set_project_image_replacement(uuid,uuid,text,bigint,text,integer,integer) to authenticated;
grant execute on function public.clear_project_image_replacement(uuid,uuid) to authenticated;

create policy "Editors upload project images" on storage.objects for insert to authenticated
  with check (bucket_id='books' and public.can_upload_project_image(name,metadata));
create policy "Editors replace project images" on storage.objects for update to authenticated
  using (bucket_id='books' and public.can_upload_project_image(name,metadata))
  with check (bucket_id='books' and public.can_upload_project_image(name,metadata));
create policy "Editors delete project images" on storage.objects for delete to authenticated
  using (bucket_id='books' and public.can_upload_project_image(name,metadata));
