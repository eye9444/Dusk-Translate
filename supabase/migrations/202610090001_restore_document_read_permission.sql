-- RLS document reads require this session-bound helper to be executable.
-- The actor-parameter helper remains restricted to the service role.
revoke all on function public.can_read_project_document(uuid) from public, anon;
grant execute on function public.can_read_project_document(uuid) to authenticated, service_role;
