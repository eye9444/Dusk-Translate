-- Run once in the Supabase SQL editor. The browser uses a publishable key only.
create table public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  file_name text not null,
  file_path text not null,
  snapshot jsonb,
  archived boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (file_path = owner_id::text || '/' || id::text || '/original'),
  check (snapshot is null or (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 30000000))
);
create index projects_owner_updated on public.projects(owner_id, updated_at desc);
alter table public.projects enable row level security;
revoke all on public.projects from anon;
grant select, insert, update, delete on public.projects to authenticated;
create policy "Owners read projects" on public.projects for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners create projects" on public.projects for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owners update projects" on public.projects for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners delete projects" on public.projects for delete to authenticated using ((select auth.uid()) = owner_id);
create function public.bump_project_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id or new.file_path <> old.file_path then
    raise exception 'Project identity cannot be changed';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger project_revision before update on public.projects for each row execute function public.bump_project_revision();

insert into storage.buckets(id,name,public,file_size_limit) values ('books','books',false,20971520);
create policy "Owners read books" on storage.objects for select to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners upload books" on storage.objects for insert to authenticated
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners delete books" on storage.objects for delete to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
