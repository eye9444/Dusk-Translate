alter table public.project_reader_links add column revoked_at timestamptz;
alter table public.project_reader_links add column comments_enabled boolean not null default false;
create table public.reader_link_revocations(token uuid primary key,project_id uuid not null,revoked_at timestamptz not null default now());
create table public.reader_comments (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 author_id uuid not null references auth.users(id),chapter_id text not null,
 body text not null check(char_length(body) between 1 and 2000),quote text check(char_length(quote)<=1000),
 text_version text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create index reader_comments_project_chapter on public.reader_comments(project_id,chapter_id,created_at);
create index reader_comments_author_time on public.reader_comments(author_id,created_at);
alter table public.reader_comments enable row level security;
alter table public.reader_link_revocations enable row level security;
revoke all on public.reader_comments,public.reader_link_revocations from anon,authenticated;

create function public.active_reader_project(reader_token uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select p.id from public.project_reader_links l join public.projects p on p.id=l.project_id
 where l.token=reader_token and l.revoked_at is null and public.launch_tier(p.owner_id)='advanced';
$$;
create or replace function public.enable_public_reader_link(target_project_id uuid)
returns table(token uuid) language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.projects where id=target_project_id and owner_id=auth.uid()) then raise exception 'Only the project owner can create a reader link'; end if;
 if public.launch_tier(auth.uid())<>'advanced' then raise exception 'Reader links require Advanced'; end if;
 return query insert into public.project_reader_links(project_id,created_by) values(target_project_id,auth.uid())
 on conflict(project_id) do update set
 token=case when project_reader_links.revoked_at is not null then gen_random_uuid() else project_reader_links.token end,
 revoked_at=null returning project_reader_links.token;
end; $$;
create or replace function public.get_public_reader_link(target_project_id uuid) returns table(token uuid)
language sql security definer set search_path='' as $$
 select l.token from public.project_reader_links l join public.projects p on p.id=l.project_id
 where p.id=target_project_id and p.owner_id=auth.uid() and l.revoked_at is null;
$$;
create or replace function public.disable_public_reader_link(target_project_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare old_token uuid;
begin
 if not exists(select 1 from public.projects where id=target_project_id and owner_id=auth.uid()) then raise exception 'Only the project owner can revoke a link'; end if;
 update public.project_reader_links set revoked_at=coalesce(revoked_at,now()) where project_id=target_project_id returning token into old_token;
 if old_token is not null then insert into public.reader_link_revocations(token,project_id) values(old_token,target_project_id) on conflict do nothing; end if;
end; $$;
create function public.set_reader_commenting(target_project uuid,enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.projects where id=target_project and owner_id=auth.uid()) then raise exception 'Only the owner can change commenting'; end if;
 if enabled and public.launch_tier(auth.uid())<>'advanced' then raise exception 'Reader comments require Advanced'; end if;
 update public.project_reader_links set comments_enabled=enabled where project_id=target_project;
 if not found then raise exception 'Create a reader link first'; end if;
end; $$;
create or replace function public.open_public_reader_link(reader_token uuid)
returns table(project_id uuid,title text,file_name text,file_path text,snapshot jsonb)
language sql security definer set search_path='' as $$
 select p.id,p.title,p.file_name,p.file_path,public.reader_snapshot(p.snapshot) from public.projects p
 where p.id=public.active_reader_project(reader_token);
$$;
create or replace function public.can_read_shared_book(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_reader_links l join public.projects p on p.id=l.project_id
 where p.file_path=object_name and l.revoked_at is null and public.launch_tier(p.owner_id)='advanced'
 and l.token::text=coalesce((coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-dusk-share-token'),''));
$$;
create function public.reader_chapter_text(target_project uuid,target_chapter text) returns text
language sql stable security definer set search_path='' as $$
 select coalesce(nullif(p.snapshot->'translations'->>target_chapter,''),c->>'text')
 from public.projects p cross join lateral jsonb_array_elements(p.snapshot->'novel'->'chapters') c
 where p.id=target_project and c->>'id'=target_chapter;
$$;
create function public.list_reader_comments(reader_token uuid,target_chapter text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare project uuid; version text; enabled boolean; owner uuid; entries jsonb;
begin
 project:=public.active_reader_project(reader_token);
 if project is null then raise exception 'This reader link is revoked or suspended'; end if;
 version:=md5(public.reader_chapter_text(project,target_chapter));
 select comments_enabled into enabled from public.project_reader_links where project_id=project;
 select owner_id into owner from public.projects where id=project;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,'quote',c.quote,
 'author',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),'Reader'),
 'mine',c.author_id=auth.uid(),'canDelete',c.author_id=auth.uid() or owner=auth.uid(),
 'createdAt',c.created_at,'outdated',c.text_version is distinct from version) order by c.created_at,c.id),'[]'::jsonb)
 into entries from public.reader_comments c join auth.users u on u.id=c.author_id
 where c.project_id=project and c.chapter_id=target_chapter and not c.deleted;
 return jsonb_build_object('enabled',enabled,'version',version,'comments',entries);
end; $$;
create function public.write_reader_comment(reader_token uuid,target_chapter text,operation text,
 comment_id uuid default null,body_text text default null,passage_quote text default null,text_version text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare project uuid; owner uuid; existing public.reader_comments; chapter_text text; current_version text; result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to comment'; end if;
 project:=public.active_reader_project(reader_token);
 if project is null then raise exception 'This reader link is revoked or suspended'; end if;
 select owner_id into owner from public.projects where id=project;
 if operation='delete' then
   update public.reader_comments set deleted=true,updated_at=now() where id=comment_id and project_id=project
    and (author_id=auth.uid() or owner=auth.uid()) returning id into result;
   if result is null then raise exception 'Comment access denied'; end if;
   return result;
 end if;
 if not (select comments_enabled from public.project_reader_links where project_id=project) then raise exception 'Commenting is disabled'; end if;
 if body_text is null or char_length(trim(body_text)) not between 1 and 2000 then raise exception 'Comments must contain 1 to 2000 characters'; end if;
 if operation='edit' then
   update public.reader_comments set body=trim(body_text),updated_at=now() where id=comment_id and project_id=project
    and author_id=auth.uid() and not deleted returning id into result;
   if result is null then raise exception 'Comment access denied'; end if;
   return result;
 end if;
 if operation<>'create' then raise exception 'Invalid comment operation'; end if;
 chapter_text:=public.reader_chapter_text(project,target_chapter);current_version:=md5(chapter_text);
 if chapter_text is null then raise exception 'This chapter has not been published yet'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':reader-comments',0));
 if (select count(*) from public.reader_comments where author_id=auth.uid() and created_at>now()-interval '1 minute')>=5
 or (select count(*) from public.reader_comments where author_id=auth.uid() and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=50
 then raise exception 'Comment posting limit reached. Please wait before posting again'; end if;
 if text_version is null or text_version !~ '^[0-9a-f]{32}$' then text_version:=current_version; end if;
 if passage_quote is not null and (char_length(passage_quote)>1000 or (text_version=current_version and position(passage_quote in chapter_text)=0)) then passage_quote:=null; end if;
 insert into public.reader_comments(project_id,author_id,chapter_id,body,quote,text_version)
 values(project,auth.uid(),target_chapter,trim(body_text),nullif(passage_quote,''),text_version) returning id into result;
 return result;
end; $$;
revoke all on function public.active_reader_project(uuid),public.reader_chapter_text(uuid,text),public.set_reader_commenting(uuid,boolean),public.list_reader_comments(uuid,text),public.write_reader_comment(uuid,text,text,uuid,text,text,text) from public;
grant execute on function public.list_reader_comments(uuid,text) to anon,authenticated;
grant execute on function public.set_reader_commenting(uuid,boolean),public.write_reader_comment(uuid,text,text,uuid,text,text,text) to authenticated;
