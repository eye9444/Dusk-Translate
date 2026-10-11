create table public.project_workflows (
  project_id uuid primary key references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  lead_id uuid not null references auth.users(id),
  proofreader_enabled boolean not null default true,
  qc_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.project_workflow_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_role text not null check(workflow_role in ('translator','proofreader','qc','lead')),
  assigned_by uuid not null references auth.users(id),
  primary key(project_id,user_id)
);
create table public.chapter_workflows (
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id text not null,
  stage text not null default 'translator' check(stage in ('translator','proofreader','qc','lead','published')),
  claimed_by uuid references auth.users(id),
  current_revision bigint not null default 0,
  published_revision bigint,
  updated_at timestamptz not null default now(),
  primary key(project_id,chapter_id)
);
create table public.chapter_workflow_revisions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id text not null,
  revision_number bigint not null,
  submitted_by uuid not null references auth.users(id),
  from_stage text not null,
  to_stage text not null,
  translation text not null check(octet_length(translation)<=2000000),
  base_mtl text check(base_mtl is null or octet_length(base_mtl)<=2000000),
  note text not null default '' check(char_length(note)<=4000),
  created_at timestamptz not null default now(),
  unique(project_id,chapter_id,revision_number)
);
create index chapter_workflow_queue on public.chapter_workflows(project_id,stage,updated_at);
alter table public.project_workflows enable row level security;
alter table public.project_workflow_members enable row level security;
alter table public.chapter_workflows enable row level security;
alter table public.chapter_workflow_revisions enable row level security;
revoke all on public.project_workflows,public.project_workflow_members,public.chapter_workflows,public.chapter_workflow_revisions from anon,authenticated;

create function public.workflow_role_for(target_project uuid,actor uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when w.lead_id=actor then 'lead' else m.workflow_role end
 from public.project_workflows w left join public.project_workflow_members m on m.project_id=w.project_id and m.user_id=actor
 where w.project_id=target_project and w.enabled;
$$;

create function public.workflow_dashboard(target_project uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; actor uuid:=auth.uid();
begin
 if actor is null or not public.project_actor_can_read_document(target_project,actor) then raise exception 'Project access required'; end if;
 select jsonb_build_object(
  'config',to_jsonb(w),'role',public.workflow_role_for(target_project,actor),
  'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'role',m.workflow_role,'email',u.email) order by u.email) from public.project_workflow_members m join auth.users u on u.id=m.user_id where m.project_id=target_project),'[]'::jsonb),
  'chapters',coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at,c.chapter_id) from public.chapter_workflows c where c.project_id=target_project),'[]'::jsonb)
 ) into result from public.project_workflows w where w.project_id=target_project;
 return coalesce(result,jsonb_build_object('config',null,'role',null,'members','[]'::jsonb,'chapters','[]'::jsonb));
end; $$;

create function public.configure_project_workflow(target_project uuid,workflow_enabled boolean,proofreader_enabled boolean,qc_enabled boolean,new_lead uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner uuid;
begin
 select owner_id into owner from public.projects where id=target_project;
 if owner is distinct from actor then raise exception 'Only the project owner can configure workflow'; end if;
 if public.launch_tier(actor)<>'advanced' then raise exception 'Team workflow requires Teams'; end if;
 if new_lead is not null and new_lead<>owner and not exists(select 1 from public.project_collaborators where project_id=target_project and user_id=new_lead and role='editor') then raise exception 'Lead must be an editor'; end if;
 insert into public.project_workflows(project_id,enabled,lead_id,proofreader_enabled,qc_enabled)
 values(target_project,workflow_enabled,coalesce(new_lead,owner),proofreader_enabled,qc_enabled)
 on conflict(project_id) do update set enabled=excluded.enabled,lead_id=excluded.lead_id,proofreader_enabled=excluded.proofreader_enabled,qc_enabled=excluded.qc_enabled,updated_at=now();
 update public.project_workflow_members set workflow_role='translator',assigned_by=actor
 where project_id=target_project and workflow_role='lead' and user_id<>coalesce(new_lead,owner);
 insert into public.project_workflow_members(project_id,user_id,workflow_role,assigned_by) values(target_project,coalesce(new_lead,owner),'lead',actor)
 on conflict(project_id,user_id) do update set workflow_role='lead',assigned_by=actor;
end; $$;

create function public.set_workflow_member_role(target_project uuid,target_user uuid,new_role text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if public.workflow_role_for(target_project,actor)<>'lead' then raise exception 'Lead access required'; end if;
 if new_role not in ('translator','proofreader','qc','lead') then raise exception 'Invalid workflow role'; end if;
 if new_role<>'lead' and exists(select 1 from public.project_workflows where project_id=target_project and lead_id=target_user) then raise exception 'Appoint another Lead before changing this role'; end if;
 if public.launch_tier(target_user)<>'advanced' then raise exception 'Every workflow member needs Teams'; end if;
 if not exists(select 1 from public.projects where id=target_project and owner_id=target_user) and not exists(select 1 from public.project_collaborators where project_id=target_project and user_id=target_user and role='editor') then raise exception 'Workflow members must be project editors'; end if;
 if new_role='lead' then
   update public.project_workflow_members set workflow_role='translator',assigned_by=actor where project_id=target_project and workflow_role='lead' and user_id<>target_user;
 end if;
 insert into public.project_workflow_members(project_id,user_id,workflow_role,assigned_by) values(target_project,target_user,new_role,actor)
 on conflict(project_id,user_id) do update set workflow_role=excluded.workflow_role,assigned_by=actor;
 if new_role='lead' then update public.project_workflows set lead_id=target_user,updated_at=now() where project_id=target_project; end if;
end; $$;

create function public.workflow_chapter_action(target_project uuid,target_chapter text,operation text,payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role text; row_state public.chapter_workflows; next_stage text; target_stage text; revision_id bigint; body text:=coalesce(payload->>'translation',''); message text:=coalesce(payload->>'note',''); config public.project_workflows;
begin
 if actor is null or public.launch_tier(actor)<>'advanced' then raise exception 'Teams access required'; end if;
 select * into config from public.project_workflows where project_id=target_project and enabled for update;
 if not found then raise exception 'Workflow is not enabled'; end if;
 actor_role:=public.workflow_role_for(target_project,actor); if actor_role is null then raise exception 'Workflow role required'; end if;
 insert into public.chapter_workflows(project_id,chapter_id) values(target_project,target_chapter) on conflict do nothing;
 select * into row_state from public.chapter_workflows where project_id=target_project and chapter_id=target_chapter for update;
 if operation='claim' then
   if row_state.stage='published' or actor_role<>row_state.stage then raise exception 'This chapter is not in your role queue'; end if;
   if row_state.claimed_by is not null and row_state.claimed_by<>actor then raise exception 'Chapter already claimed'; end if;
   update public.chapter_workflows set claimed_by=actor,updated_at=now() where project_id=target_project and chapter_id=target_chapter;
   return jsonb_build_object('stage',row_state.stage,'claimedBy',actor);
 end if;
 if operation='return' then
   if actor_role<>row_state.stage then raise exception 'Only the current review stage can return this chapter'; end if;
   if char_length(trim(message))=0 then raise exception 'A return note is required'; end if;
   target_stage:=payload->>'targetStage';
   if target_stage not in ('translator','proofreader','qc') then raise exception 'Choose an earlier stage'; end if;
   if array_position(array['translator','proofreader','qc','lead'],target_stage)>=array_position(array['translator','proofreader','qc','lead'],row_state.stage) then raise exception 'Return target must be earlier'; end if;
   next_stage:=target_stage;
 elsif operation in ('submit','publish') then
   if actor_role<>row_state.stage then raise exception 'Your role cannot submit this stage'; end if;
   if body='' then raise exception 'Translation is required'; end if;
   if operation='publish' then
     if row_state.stage<>'lead' then raise exception 'Only the lead stage can publish'; end if; next_stage:='published';
   elsif row_state.stage='translator' then next_stage:=case when config.proofreader_enabled then 'proofreader' when config.qc_enabled then 'qc' else 'lead' end;
   elsif row_state.stage='proofreader' then next_stage:=case when config.qc_enabled then 'qc' else 'lead' end;
   elsif row_state.stage='qc' then next_stage:='lead';
   else raise exception 'Lead must publish the chapter'; end if;
 else raise exception 'Unknown workflow operation'; end if;
 update public.chapter_workflows set current_revision=current_revision+1,stage=next_stage,claimed_by=null,published_revision=case when next_stage='published' then current_revision+1 else published_revision end,updated_at=now() where project_id=target_project and chapter_id=target_chapter returning * into row_state;
 insert into public.chapter_workflow_revisions(project_id,chapter_id,revision_number,submitted_by,from_stage,to_stage,translation,base_mtl,note)
 values(target_project,target_chapter,row_state.current_revision,actor,actor_role,next_stage,body,nullif(payload->>'baseMtl',''),message) returning id into revision_id;
 return jsonb_build_object('revisionId',revision_id,'revision',row_state.current_revision,'stage',next_stage,'translation',body);
end; $$;

create function public.workflow_chapter_revisions(target_project uuid,target_chapter text) returns table(id bigint,revision_number bigint,submitted_by uuid,submitter_email text,from_stage text,to_stage text,translation text,base_mtl text,note text,created_at timestamptz)
language sql security definer set search_path='' as $$
 select r.id,r.revision_number,r.submitted_by,u.email::text,r.from_stage,r.to_stage,r.translation,r.base_mtl,r.note,r.created_at
 from public.chapter_workflow_revisions r join auth.users u on u.id=r.submitted_by
 where r.project_id=target_project and r.chapter_id=target_chapter and public.project_actor_can_read_document(target_project,auth.uid()) order by r.revision_number desc;
$$;

create function public.workflow_published_translations(target_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.project_actor_can_read_document(target_project,auth.uid()) then raise exception 'Project access required'; end if;
 select coalesce(jsonb_object_agg(c.chapter_id,r.translation),'{}'::jsonb) into result
 from public.chapter_workflows c join public.chapter_workflow_revisions r on r.project_id=c.project_id and r.chapter_id=c.chapter_id and r.revision_number=c.published_revision
 where c.project_id=target_project and c.stage='published';
 return result;
end; $$;

create function public.workflow_reader_snapshot(target_project uuid,value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 with published as (
  select coalesce(jsonb_object_agg(c.chapter_id,r.translation),'{}'::jsonb) translations
  from public.chapter_workflows c join public.chapter_workflow_revisions r on r.project_id=c.project_id and r.chapter_id=c.chapter_id and r.revision_number=c.published_revision
  where c.project_id=target_project and c.stage='published'
 ), prepared as (
  select case when exists(select 1 from public.project_workflows where project_id=target_project and enabled)
   then jsonb_set(value,'{translations}',(select translations from published),true) else value end snapshot
 ) select public.reader_snapshot(snapshot) from prepared;
$$;

create or replace function public.open_public_reader_link(reader_token uuid)
returns table(project_id uuid,title text,file_name text,file_path text,snapshot jsonb)
language sql security definer set search_path='' as $$
 select p.id,p.title,p.file_name,p.file_path,public.workflow_reader_snapshot(p.id,p.snapshot) from public.projects p
 where p.id=public.active_reader_project(reader_token);
$$;

create or replace function public.reader_chapter_text(target_project uuid,target_chapter text) returns text
language sql stable security definer set search_path='' as $$
 select coalesce(nullif(s.snapshot->'translations'->>target_chapter,''),c->>'text')
 from public.projects p cross join lateral (select public.workflow_reader_snapshot(p.id,p.snapshot) snapshot) s
 cross join lateral jsonb_array_elements(s.snapshot->'novel'->'chapters') c
 where p.id=target_project and c->>'id'=target_chapter;
$$;

revoke all on function public.workflow_role_for(uuid,uuid),public.workflow_dashboard(uuid),public.configure_project_workflow(uuid,boolean,boolean,boolean,uuid),public.set_workflow_member_role(uuid,uuid,text),public.workflow_chapter_action(uuid,text,text,jsonb),public.workflow_chapter_revisions(uuid,text),public.workflow_published_translations(uuid),public.workflow_reader_snapshot(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.workflow_dashboard(uuid),public.configure_project_workflow(uuid,boolean,boolean,boolean,uuid),public.set_workflow_member_role(uuid,uuid,text),public.workflow_chapter_action(uuid,text,text,jsonb),public.workflow_chapter_revisions(uuid,text),public.workflow_published_translations(uuid) to authenticated;
