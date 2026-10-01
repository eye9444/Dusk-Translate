create table public.project_comment_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  anchor jsonb not null check(jsonb_typeof(anchor) = 'object' and octet_length(anchor::text) <= 16000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index project_comment_threads_project on public.project_comment_threads(project_id, created_at);
create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.project_comment_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check(char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index project_comments_thread on public.project_comments(thread_id, created_at);
alter table public.project_comment_threads enable row level security;
alter table public.project_comments enable row level security;
revoke all on public.project_comment_threads, public.project_comments from anon, authenticated;

create function public.list_project_comments(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_document(target_project_id) then raise exception 'Editor access required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', t.id, 'author_id', t.author_id, 'anchor', t.anchor, 'resolved', t.resolved, 'created_at', t.created_at,
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'author_id', c.author_id, 'body', c.body, 'created_at', c.created_at, 'edited_at', c.edited_at,
      'author_name', left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''), nullif(u.raw_user_meta_data->>'name',''), 'Collaborator'),80)
    ) order by c.created_at, c.id) from public.project_comments c join auth.users u on u.id = c.author_id where c.thread_id = t.id),'[]'::jsonb)
  ) order by t.created_at, t.id) from public.project_comment_threads t where t.project_id = target_project_id),'[]'::jsonb);
end;
$$;

create function public.write_project_comment(target_project_id uuid, action text, target_id uuid default null, comment_body text default null, comment_anchor jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid; thread_id_value uuid; is_owner boolean;
begin
  perform 1 from public.projects where id = target_project_id for update;
  if not public.can_edit_document(target_project_id) then raise exception 'Editor access required.'; end if;
  select owner_id = auth.uid() into is_owner from public.projects where id = target_project_id;
  if action in ('create','reply','edit') and (comment_body is null or char_length(trim(comment_body)) not between 1 and 4000) then
    raise exception 'Comments must contain between 1 and 4000 characters.';
  end if;
  if action in ('create','reply') then
    if (select count(*) from public.project_comments c join public.project_comment_threads t on t.id = c.thread_id where t.project_id = target_project_id) >= 5000 then raise exception 'Project comment limit reached.'; end if;
    if (select count(*) from public.project_comments c join public.project_comment_threads t on t.id = c.thread_id where t.project_id = target_project_id and c.author_id = auth.uid() and c.created_at > now() - interval '1 minute') >= 30 then raise exception 'Please wait before posting more comments.'; end if;
  end if;
  if action = 'create' then
    if comment_anchor is null or jsonb_typeof(comment_anchor) <> 'object'
      or coalesce(jsonb_typeof(comment_anchor->'quote'),'null') <> 'string'
      or coalesce(jsonb_typeof(comment_anchor->'chapterId'),'null') <> 'string'
      or coalesce(jsonb_typeof(comment_anchor->'prefix'),'null') <> 'string'
      or coalesce(jsonb_typeof(comment_anchor->'suffix'),'null') <> 'string'
      or coalesce(jsonb_typeof(comment_anchor->'start'),'null') <> 'number'
      or coalesce(jsonb_typeof(comment_anchor->'end'),'null') <> 'number'
      or coalesce(comment_anchor->>'pane','') not in ('source','translation')
      or coalesce(char_length(comment_anchor->>'quote'),0) not between 1 and 2000
      or coalesce(char_length(comment_anchor->>'chapterId'),0) not between 1 and 500
      or coalesce(char_length(comment_anchor->>'prefix'),0) > 48 or coalesce(char_length(comment_anchor->>'suffix'),0) > 48
      or coalesce(comment_anchor->>'start','') !~ '^[0-9]{1,9}$' or coalesce(comment_anchor->>'end','') !~ '^[0-9]{1,9}$' then raise exception 'Invalid comment selection.'; end if;
    if (comment_anchor->>'end')::integer <= (comment_anchor->>'start')::integer then raise exception 'Invalid comment selection.'; end if;
    if (select count(*) from public.project_comment_threads where project_id = target_project_id) >= 1000 then raise exception 'Project thread limit reached.'; end if;
    insert into public.project_comment_threads(project_id,author_id,anchor) values(target_project_id,auth.uid(),comment_anchor) returning id into result_id;
    insert into public.project_comments(thread_id,author_id,body) values(result_id,auth.uid(),trim(comment_body));
  elsif action in ('reply','resolve','reopen','delete-thread') then
    select id into thread_id_value from public.project_comment_threads where id = target_id and project_id = target_project_id;
    if thread_id_value is null then raise exception 'Comment thread not found.'; end if;
    result_id := thread_id_value;
    if action = 'reply' then
      insert into public.project_comments(thread_id,author_id,body) values(thread_id_value,auth.uid(),trim(comment_body)) returning id into result_id;
    elsif action in ('resolve','reopen') then
      update public.project_comment_threads set resolved = (action = 'resolve') where id = thread_id_value;
    else
      if not is_owner and not exists(select 1 from public.project_comment_threads where id = thread_id_value and author_id = auth.uid()) then raise exception 'Only the thread author or owner can delete a thread.'; end if;
      delete from public.project_comment_threads where id = thread_id_value;
    end if;
  elsif action in ('edit','delete') then
    select t.id into thread_id_value from public.project_comments c join public.project_comment_threads t on t.id=c.thread_id
      where c.id=target_id and t.project_id=target_project_id and (c.author_id=auth.uid() or (action='delete' and is_owner));
    if thread_id_value is null then raise exception 'Comment not found or access denied.'; end if;
    if action='edit' then update public.project_comments set body=trim(comment_body),edited_at=now() where id=target_id;
    else delete from public.project_comments where id=target_id; end if;
    result_id := target_id;
  else raise exception 'Unsupported comment action.';
  end if;
  return result_id;
end;
$$;
revoke all on function public.list_project_comments(uuid) from public;
revoke all on function public.write_project_comment(uuid,text,uuid,text,jsonb) from public;
grant execute on function public.list_project_comments(uuid) to authenticated;
grant execute on function public.write_project_comment(uuid,text,uuid,text,jsonb) to authenticated;
