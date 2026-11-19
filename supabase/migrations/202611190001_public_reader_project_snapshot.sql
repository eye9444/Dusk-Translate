-- Public links follow the saved project edition, not the team review queue.
create or replace function public.workflow_reader_snapshot(target_project uuid,value jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.reader_snapshot(value);
$$;
