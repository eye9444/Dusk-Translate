-- Policies execute with the caller's function permissions. Expose only a
-- session-bound wrapper; the arbitrary-actor helper remains server-only.
create function public.can_read_project_document(target_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.project_actor_can_read_document(target_project, auth.uid());
$$;
revoke all on function public.can_read_project_document(uuid) from public, anon, authenticated;
grant execute on function public.can_read_project_document(uuid) to authenticated, service_role;

alter policy "Editors preserve working documents" on public.project_documents
  using (public.can_read_project_document(project_id));
alter policy "Editors preserve working updates" on public.project_document_updates
  using (public.can_read_project_document(project_id));
