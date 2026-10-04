-- Explicit database billing environment. Change deliberately with the server configuration.
create table public.launch_configuration (
 singleton boolean primary key default true check(singleton),
 environment text not null check(environment in ('sandbox','production'))
);
insert into public.launch_configuration values(true,'sandbox');
alter table public.launch_configuration enable row level security;
revoke all on public.launch_configuration from anon,authenticated;
grant all on public.launch_configuration to service_role;

create function public.launch_tier(account uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare environment_name text;
begin
 select environment into environment_name from public.launch_configuration where singleton;
 if environment_name is null then raise exception 'Billing environment is not configured'; end if;
 return public.account_tier(account,environment_name);
end; $$;
create function public.launch_limits(tier text) returns jsonb language sql immutable set search_path='' as $$
 select case tier
 when 'advanced' then '{"projects":200,"storageBytes":5000000000,"seats":10,"dailyCharacters":null}'::jsonb
 when 'pro' then '{"projects":50,"storageBytes":1000000000,"seats":5,"dailyCharacters":null}'::jsonb
 else '{"projects":3,"storageBytes":100000000,"seats":2,"dailyCharacters":30000}'::jsonb end;
$$;
create table public.project_launch_preferences (
 project_id uuid primary key references public.projects(id) on delete cascade,
 editable_priority boolean not null default false,
 selected_members uuid[],
 custom_instructions text not null default '' check(char_length(custom_instructions)<=10000)
);
alter table public.project_launch_preferences enable row level security;
revoke all on public.project_launch_preferences from anon,authenticated;
grant all on public.project_launch_preferences to service_role;

create function public.project_editable(target_project uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from (
   select p.id,row_number() over(order by coalesce(pref.editable_priority,false) desc,p.created_at,p.id) as position,
     (public.launch_limits(public.launch_tier(p.owner_id))->>'projects')::int as allowance
   from public.projects p left join public.project_launch_preferences pref on pref.project_id=p.id
   where p.owner_id=(select owner_id from public.projects where id=target_project)
 ) ranked where id=target_project and position<=allowance);
$$;
create function public.project_member_active(target_project uuid,actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from (
   select c.user_id,row_number() over(order by
     case when pref.selected_members is not null and c.user_id=any(pref.selected_members) then 0 else 1 end,
     c.created_at,c.user_id) as position,
     (public.launch_limits(public.launch_tier(p.owner_id))->>'seats')::int-1 as allowance
   from public.project_collaborators c join public.projects p on p.id=c.project_id
   left join public.project_launch_preferences pref on pref.project_id=p.id
   where c.project_id=target_project and c.user_id<>p.owner_id
 ) ranked where user_id=actor and position<=allowance);
$$;
create function public.project_actor_can_edit(target_project uuid,actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.project_editable(target_project) and exists(select 1 from public.projects p where p.id=target_project
 and (p.owner_id=actor or (public.project_member_active(target_project,actor) and exists(
 select 1 from public.project_collaborators c where c.project_id=target_project and c.user_id=actor and c.role='editor'))));
$$;
create or replace function public.can_access_project(target_project_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects where id=target_project_id and owner_id=auth.uid())
 or public.project_member_active(target_project_id,auth.uid());
$$;
create or replace function public.can_edit_document(target_project_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.project_actor_can_edit(target_project_id,auth.uid());
$$;

create function public.project_entitlements(target_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.projects; tier text; prompt text;
begin
 select * into p from public.projects where id=target_project;
 if not found or not public.can_access_project(target_project) then raise exception 'Project access required'; end if;
 tier:=public.launch_tier(p.owner_id);
 select custom_instructions into prompt from public.project_launch_preferences where project_id=p.id;
 return jsonb_build_object('tier',tier,'limits',public.launch_limits(tier),'isOwner',p.owner_id=auth.uid(),
   'editable',public.project_actor_can_edit(p.id,auth.uid()),
   'customInstructions',case when tier='advanced' then coalesce(prompt,'') else '' end);
end; $$;
create function public.select_editable_projects(selected uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare allowance integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':cloud',0));
 allowance:=(public.launch_limits(public.launch_tier(auth.uid()))->>'projects')::int;
 if selected is null or cardinality(selected)>allowance or exists(select 1 from unnest(selected) id where not exists(
   select 1 from public.projects p where p.id=id and p.owner_id=auth.uid())) then raise exception 'Invalid project selection'; end if;
 insert into public.project_launch_preferences(project_id,editable_priority)
 select id,id=any(selected) from public.projects where owner_id=auth.uid()
 on conflict(project_id) do update set editable_priority=excluded.editable_priority;
end; $$;
create function public.configure_project_launch(target_project uuid,selected uuid[] default null,instructions text default null)
returns void language plpgsql security definer set search_path='' as $$
declare p public.projects; allowance integer;
begin
 select * into p from public.projects where id=target_project;
 if not found or p.owner_id is distinct from auth.uid() then raise exception 'Only the project owner can configure this project'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p.id::text||':seats',0));
 allowance:=(public.launch_limits(public.launch_tier(p.owner_id))->>'seats')::int-1;
 if selected is not null and (cardinality(selected)>allowance or exists(select 1 from unnest(selected) member where not exists(
   select 1 from public.project_collaborators where project_id=p.id and user_id=member))) then raise exception 'Invalid collaborator selection'; end if;
 if instructions is not null and public.launch_tier(p.owner_id)<>'advanced' then raise exception 'Custom prompts require Advanced'; end if;
 insert into public.project_launch_preferences(project_id,selected_members,custom_instructions)
 values(p.id,selected,coalesce(instructions,'')) on conflict(project_id) do update set
 selected_members=coalesce(selected,project_launch_preferences.selected_members),
 custom_instructions=coalesce(instructions,project_launch_preferences.custom_instructions);
end; $$;

create function public.enforce_project_seats() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.projects; allowance integer; used integer; target_email text;
begin
 select * into p from public.projects where id=new.project_id;
 perform pg_advisory_xact_lock(hashtextextended(p.id::text||':seats',0));
 allowance:=(public.launch_limits(public.launch_tier(p.owner_id))->>'seats')::int;
 if tg_table_name='project_invitations' then
   target_email:=new.email;
   if target_email=(select lower(email) from auth.users where id=p.owner_id) then raise exception 'Owner already occupies a seat'; end if;
   if exists(select 1 from public.project_invitations where project_id=p.id and email=target_email)
      or exists(select 1 from public.project_collaborators c join auth.users u on u.id=c.user_id where c.project_id=p.id and lower(u.email)=target_email) then return new; end if;
 else
   if new.user_id=p.owner_id then raise exception 'Owner already occupies a seat'; end if;
   if exists(select 1 from public.project_collaborators where project_id=p.id and user_id=new.user_id) then return new; end if;
   select lower(email) into target_email from auth.users where id=new.user_id;
 end if;
 select 1+(select count(*) from public.project_collaborators where project_id=p.id and user_id<>p.owner_id)
   +(select count(*) from public.project_invitations i where i.project_id=p.id and i.email<>target_email
     and not exists(select 1 from public.project_collaborators c join auth.users u on u.id=c.user_id where c.project_id=p.id and lower(u.email)=i.email))
 into used;
 if used>=allowance then raise exception 'This project has reached its plan seat limit (including pending invitations)'; end if;
 return new;
end; $$;
create trigger launch_invitation_seats before insert on public.project_invitations for each row execute function public.enforce_project_seats();
create trigger launch_member_seats before insert on public.project_collaborators for each row execute function public.enforce_project_seats();

create table public.cloud_upload_reservations (
 object_name text primary key,owner_id uuid not null references auth.users(id),actor_id uuid not null references auth.users(id),
 project_id uuid not null,bytes bigint not null check(bytes between 1 and 52428800),
 state text not null check(state in ('reserved','uploaded','released')),expires_at timestamptz not null
);
alter table public.cloud_upload_reservations enable row level security;
revoke all on public.cloud_upload_reservations from anon,authenticated;
create function public.account_storage_bytes(account uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce((select sum(coalesce((metadata->>'size')::bigint,0)) from storage.objects where bucket_id='books' and split_part(name,'/',1)=account::text),0)
 +coalesce((select sum(octet_length(snapshot::text)) from public.projects where owner_id=account),0)
 +coalesce((select sum(octet_length(d.seed)) from public.project_documents d join public.projects p on p.id=d.project_id where p.owner_id=account),0)
 +coalesce((select sum(octet_length(d.payload)) from public.project_document_updates d join public.projects p on p.id=d.project_id where p.owner_id=account),0);
$$;
create function public.reserved_storage_bytes(account uuid,except_object text default '') returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce(sum(greatest(0,r.bytes-coalesce((o.metadata->>'size')::bigint,0))),0)
 from public.cloud_upload_reservations r left join storage.objects o on o.bucket_id='books' and o.name=r.object_name
 where r.owner_id=account and r.state='reserved' and r.expires_at>now() and r.object_name<>except_object;
$$;
create function public.reserve_cloud_upload(target_project uuid,object_name text,upload_bytes bigint) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid; tier text; existing_bytes bigint; project_limit integer;
begin
 if auth.uid() is null or upload_bytes not between 1 and 52428800 then raise exception 'Invalid upload'; end if;
 select owner_id into account from public.projects where id=target_project;
 if account is null then
   account:=auth.uid();
   if object_name<>account::text||'/'||target_project::text||'/original' then raise exception 'Invalid original path'; end if;
 else
   if not public.can_edit_document(target_project) or public.launch_tier(account)='free'
      or object_name not like account::text||'/'||target_project::text||'/images/%' then raise exception 'Image replacement requires an editable Pro project'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(account::text||':cloud',0));
 tier:=public.launch_tier(account);project_limit:=(public.launch_limits(tier)->>'projects')::int;
 if not exists(select 1 from public.projects where id=target_project) and
   (select count(*) from public.projects where owner_id=account)
   +(select count(*) from public.cloud_upload_reservations r where r.owner_id=account and r.project_id<>target_project
      and r.state<>'released' and r.expires_at>now() and not exists(select 1 from public.projects where id=r.project_id))>=project_limit
 then raise exception 'Cloud project limit reached'; end if;
 select coalesce((metadata->>'size')::bigint,0) into existing_bytes from storage.objects where bucket_id='books' and name=object_name;
 if public.account_storage_bytes(account)+public.reserved_storage_bytes(account,object_name)+greatest(0,upload_bytes-coalesce(existing_bytes,0))>
    (public.launch_limits(tier)->>'storageBytes')::bigint then raise exception 'Cloud storage limit reached'; end if;
 insert into public.cloud_upload_reservations values(object_name,account,auth.uid(),target_project,upload_bytes,'reserved',now()+interval '30 minutes')
 on conflict on constraint cloud_upload_reservations_pkey do update set bytes=excluded.bytes,actor_id=excluded.actor_id,state='reserved',expires_at=excluded.expires_at;
end; $$;
create function public.release_cloud_upload(target_object text) returns void
language sql security definer set search_path='' as $$
 update public.cloud_upload_reservations set state='released' where object_name=target_object and actor_id=auth.uid();
$$;
create function public.enforce_cloud_upload() returns trigger
language plpgsql security definer set search_path='' as $$
declare reservation public.cloud_upload_reservations; actual_bytes bigint; previous_bytes bigint:=0;
begin
 if new.bucket_id<>'books' then return new; end if;
 select * into reservation from public.cloud_upload_reservations where object_name=new.name;
 if not found or reservation.actor_id is distinct from auth.uid() or reservation.state<>'reserved' or reservation.expires_at<=now()
 then raise exception 'Reserve upload capacity before uploading'; end if;
 perform pg_advisory_xact_lock(hashtextextended(reservation.owner_id::text||':cloud',0));
 actual_bytes:=coalesce((new.metadata->>'size')::bigint,0);
 if actual_bytes<1 or actual_bytes>reservation.bytes then raise exception 'Upload exceeds reserved size'; end if;
 if tg_op='UPDATE' then previous_bytes:=coalesce((old.metadata->>'size')::bigint,0); end if;
 if public.account_storage_bytes(reservation.owner_id)+public.reserved_storage_bytes(reservation.owner_id,new.name)+actual_bytes-previous_bytes>
   (public.launch_limits(public.launch_tier(reservation.owner_id))->>'storageBytes')::bigint then raise exception 'Cloud storage limit reached'; end if;
 update public.cloud_upload_reservations set state='uploaded' where object_name=new.name;
 return new;
end; $$;
create trigger launch_upload_size before insert or update of metadata on storage.objects for each row execute function public.enforce_cloud_upload();

create function public.enforce_project_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare growth bigint; limits jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text||':cloud',0));
 limits:=public.launch_limits(public.launch_tier(new.owner_id));
 if tg_op='INSERT' then
   if (select count(*) from public.projects where owner_id=new.owner_id)>=(limits->>'projects')::int then raise exception 'Cloud project limit reached'; end if;
   growth:=coalesce(octet_length(new.snapshot::text),0);
 else
   if auth.uid() is not null and not public.project_actor_can_edit(old.id,auth.uid()) then raise exception 'This project is read-only under the owner plan'; end if;
   growth:=coalesce(octet_length(new.snapshot::text),0)-coalesce(octet_length(old.snapshot::text),0);
 end if;
 if growth>0 and public.account_storage_bytes(new.owner_id)+public.reserved_storage_bytes(new.owner_id)+growth>(limits->>'storageBytes')::bigint
 then raise exception 'Cloud storage limit reached; reading and exports remain available'; end if;
 return new;
end; $$;
create trigger launch_project_capacity before insert or update on public.projects for each row execute function public.enforce_project_capacity();
create function public.enforce_document_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare account uuid; growth bigint;
begin
 select owner_id into account from public.projects where id=new.project_id;
 perform pg_advisory_xact_lock(hashtextextended(account::text||':cloud',0));
 if tg_table_name='project_documents' then growth:=octet_length(new.seed); else growth:=octet_length(new.payload); end if;
 if public.account_storage_bytes(account)+public.reserved_storage_bytes(account)+growth>(public.launch_limits(public.launch_tier(account))->>'storageBytes')::bigint
 then raise exception 'Cloud storage limit reached'; end if;
 return new;
end; $$;
create trigger launch_document_capacity before insert on public.project_documents for each row execute function public.enforce_document_capacity();
create trigger launch_update_capacity before insert on public.project_document_updates for each row execute function public.enforce_document_capacity();
create function public.enforce_image_tier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if public.launch_tier((select owner_id from public.projects where id=new.project_id))='free' then raise exception 'Image replacement requires Pro'; end if;
 return new;
end; $$;
create trigger launch_image_tier before insert or update on public.project_image_assets for each row execute function public.enforce_image_tier();

drop policy "Editors read project images" on public.project_image_assets;
create policy "Members preserve project images" on public.project_image_assets for select to authenticated
 using(public.can_access_project(project_id));

alter function public.translation_quota(uuid,text,uuid,text,uuid,text,text) rename to translation_quota_accounting;
revoke all on function public.translation_quota_accounting(uuid,text,uuid,text,uuid,text,text) from service_role;
create function public.translation_quota(target_actor uuid,target_environment text,target_project uuid,operation text,
 attempt_id uuid default null,target_chapter text default null,target_output_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if target_environment is distinct from (select environment from public.launch_configuration where singleton) then raise exception 'Billing environment mismatch'; end if;
 if not public.project_actor_can_edit(target_project,target_actor) then raise exception 'This project is read-only or access is suspended'; end if;
 return public.translation_quota_accounting(target_actor,target_environment,target_project,operation,attempt_id,target_chapter,target_output_hash);
end; $$;
revoke all on function public.translation_quota(uuid,text,uuid,text,uuid,text,text) from public;
grant execute on function public.translation_quota(uuid,text,uuid,text,uuid,text,text) to service_role;

revoke all on function public.launch_tier(uuid),public.launch_limits(text),public.project_editable(uuid),public.project_member_active(uuid,uuid),public.project_actor_can_edit(uuid,uuid),public.account_storage_bytes(uuid),public.reserved_storage_bytes(uuid,text) from public;
revoke all on function public.project_entitlements(uuid),public.select_editable_projects(uuid[]),public.configure_project_launch(uuid,uuid[],text),public.reserve_cloud_upload(uuid,text,bigint),public.release_cloud_upload(text) from public;
grant execute on function public.project_entitlements(uuid),public.select_editable_projects(uuid[]),public.configure_project_launch(uuid,uuid[],text),public.reserve_cloud_upload(uuid,text,bigint),public.release_cloud_upload(text) to authenticated;
grant execute on function public.launch_tier(uuid),public.project_actor_can_edit(uuid,uuid),public.project_editable(uuid),public.project_member_active(uuid,uuid) to service_role;
grant select on public.projects,public.project_collaborators,public.project_documents,public.project_document_updates to service_role;
