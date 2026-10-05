create or replace function public.set_project_image_replacement(
  target_project_id uuid, image_id uuid, object_name text,
  image_bytes bigint, image_mime text, image_width integer, image_height integer
) returns public.project_image_assets
language plpgsql security definer set search_path = '' as $$
declare result public.project_image_assets; expected_path text;
begin
  if not public.can_edit_document(target_project_id) then raise exception 'Editor access required.'; end if;
  select p.owner_id::text || '/' || image.project_id::text || '/images/' || image.id::text ||
    case image_mime
      when 'image/png' then '/replacement.png'
      when 'image/jpeg' then '/replacement.jpg'
      when 'image/webp' then '/replacement.webp'
    end into expected_path
  from public.project_image_assets image join public.projects p on p.id=image.project_id
  where image.id=image_id and image.project_id=target_project_id;
  if not found then raise exception 'Image asset not found.'; end if;
  if expected_path is null or object_name is distinct from expected_path then
    raise exception 'Replacement object must belong to the target project and image.';
  end if;
  if image_width is null or image_height is null
    or image_width not between 1 and 8192 or image_height not between 1 and 8192
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
revoke all on function public.set_project_image_replacement(uuid,uuid,text,bigint,text,integer,integer) from public,anon,authenticated;
grant execute on function public.set_project_image_replacement(uuid,uuid,text,bigint,text,integer,integer) to authenticated,service_role;

-- No comment/thread foreign key: deletion must not refund posting allowance.
create table public.project_comment_postings (
  comment_id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  posted_at timestamptz not null
);
create index project_comment_postings_rate on public.project_comment_postings(project_id,author_id,posted_at);
alter table public.project_comment_postings enable row level security;
revoke all on public.project_comment_postings from public,anon,authenticated;
-- Preserve the current allowance even if an existing comment is deleted next.
insert into public.project_comment_postings(comment_id,project_id,author_id,posted_at)
select c.id,t.project_id,c.author_id,c.created_at
from public.project_comments c join public.project_comment_threads t on t.id=c.thread_id
where c.created_at>clock_timestamp()-interval '1 minute';

create function public.enforce_project_comment_posting_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_project uuid; posted_time timestamptz;
begin
  select project_id into target_project from public.project_comment_threads where id=new.thread_id;
  -- Use the same project lock as write_project_comment, including for replies.
  perform 1 from public.projects where id=target_project for update;
  posted_time:=clock_timestamp();
  delete from public.project_comment_postings
    where project_id=target_project and author_id=new.author_id
      and posted_at<=posted_time-interval '1 minute';
  if (select count(*) from public.project_comment_postings
      where project_id=target_project and author_id=new.author_id
        and posted_at>posted_time-interval '1 minute')>=30
  then raise exception 'Please wait before posting more comments.'; end if;
  insert into public.project_comment_postings(comment_id,project_id,author_id,posted_at)
    values(new.id,target_project,new.author_id,posted_time);
  return new;
end;
$$;
revoke all on function public.enforce_project_comment_posting_rate() from public,anon,authenticated;
grant execute on function public.enforce_project_comment_posting_rate() to service_role;
create trigger project_comment_posting_rate before insert on public.project_comments
for each row execute function public.enforce_project_comment_posting_rate();
