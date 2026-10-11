alter table public.project_launch_preferences drop constraint if exists project_launch_preferences_custom_instructions_check;
alter table public.project_launch_preferences add constraint project_launch_preferences_custom_instructions_check
check(char_length(custom_instructions)<=20000 and octet_length(custom_instructions)<=80000);

create or replace function public.set_project_instructions(target_project uuid,instructions text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.project_actor_can_edit(target_project,auth.uid()) then raise exception 'Editor access required'; end if;
 if public.launch_tier(auth.uid())<>'advanced' then raise exception 'Custom prompts require your own Teams plan'; end if;
 if instructions is null or char_length(instructions)>20000 or octet_length(instructions)>80000 then
   raise exception 'Prompt must be at most 20000 characters and 80000 bytes';
 end if;
 insert into public.project_launch_preferences(project_id,custom_instructions) values(target_project,instructions)
 on conflict(project_id) do update set custom_instructions=excluded.custom_instructions;
end; $$;
revoke all on function public.set_project_instructions(uuid,text) from public,anon,authenticated;
grant execute on function public.set_project_instructions(uuid,text) to authenticated;
