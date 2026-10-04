-- PostgreSQL grants function execution to PUBLIC by default. Remove that broad
-- capability from every privileged function before granting the API surface.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;

-- Token-scoped public reading. Comment writes still require authentication.
grant execute on function
  public.open_public_reader_link(uuid),
  public.can_read_shared_book(text),
  public.list_reader_comments(uuid,text)
to anon, authenticated;

-- Authenticated browser operations. Each function performs its own ownership,
-- membership, entitlement, capacity, or token checks before touching data.
grant execute on function
  public.account_cloud_capacity(),
  public.can_access_project(uuid),
  public.can_access_project_file(text),
  public.can_edit_document(uuid),
  public.can_upload_project_image(text,jsonb),
  public.clear_project_image_replacement(uuid,uuid),
  public.configure_project_launch(uuid,uuid[],text),
  public.create_project_invitations(uuid,jsonb),
  public.disable_public_reader_link(uuid),
  public.enable_public_reader_link(uuid),
  public.get_public_reader_link(uuid),
  public.leave_project_presence(uuid,uuid),
  public.list_my_project_invitations(),
  public.list_project_collaborators(uuid),
  public.list_project_comments(uuid),
  public.list_project_invitations(uuid),
  public.project_entitlements(uuid),
  public.project_seat_selection(uuid),
  public.reader_link_status(uuid),
  public.register_project_image(uuid,uuid,text,bigint,text),
  public.release_cloud_upload(text),
  public.remove_project_collaborator(uuid,uuid),
  public.reserve_cloud_upload(uuid,text,bigint),
  public.respond_to_project_invitation(uuid,boolean),
  public.revoke_project_invitation(uuid),
  public.select_editable_projects(uuid[]),
  public.set_project_image_replacement(uuid,uuid,text,bigint,text,integer,integer),
  public.set_project_instructions(uuid,text),
  public.set_reader_commenting(uuid,boolean),
  public.share_project(uuid,text,text),
  public.sync_project_presence(uuid,uuid,jsonb),
  public.update_project_collaborator_role(uuid,uuid,text),
  public.write_project_comment(uuid,text,uuid,text,jsonb),
  public.write_reader_comment(uuid,text,text,uuid,text,text,text)
to authenticated;
