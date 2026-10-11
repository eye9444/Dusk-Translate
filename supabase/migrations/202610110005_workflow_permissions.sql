revoke all on function public.set_project_instructions(uuid,text) from public,anon,authenticated;
grant execute on function public.set_project_instructions(uuid,text) to authenticated;

revoke all on function public.workflow_role_for(uuid,uuid),public.workflow_dashboard(uuid),public.configure_project_workflow(uuid,boolean,boolean,boolean,uuid),public.set_workflow_member_role(uuid,uuid,text),public.workflow_chapter_action(uuid,text,text,jsonb),public.workflow_chapter_revisions(uuid,text),public.workflow_published_translations(uuid),public.workflow_reader_snapshot(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.workflow_dashboard(uuid),public.configure_project_workflow(uuid,boolean,boolean,boolean,uuid),public.set_workflow_member_role(uuid,uuid,text),public.workflow_chapter_action(uuid,text,text,jsonb),public.workflow_chapter_revisions(uuid,text),public.workflow_published_translations(uuid) to authenticated;
