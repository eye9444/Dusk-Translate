-- A thread has no useful state once its final message is removed.
delete from public.project_comment_threads t
where not exists (
  select 1 from public.project_comments c where c.thread_id = t.id
);

create function public.remove_empty_comment_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.project_comment_threads t
  where t.id = old.thread_id
    and not exists (
      select 1 from public.project_comments c where c.thread_id = old.thread_id
    );
  return null;
end;
$$;

revoke all on function public.remove_empty_comment_thread() from public;

create trigger remove_empty_comment_thread_after_delete
after delete on public.project_comments
for each row execute function public.remove_empty_comment_thread();
