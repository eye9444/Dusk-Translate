-- Personal premium tools and translation usage; ownership still governs capacity.
-- Keep the internal 'advanced' key for historical billing compatibility (Teams).
create index translation_attempts_actor_day on public.translation_attempts(actor_id,environment,day);

create or replace function public.enforce_image_tier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.launch_tier(auth.uid())='free' then raise exception 'Image replacement requires a personal Pro plan'; end if;
 return new;
end; $$;

create or replace function public.translation_quota_accounting(
 target_actor uuid,target_environment text,target_project uuid,operation text,
 attempt_id uuid default null,target_chapter text default null,target_output_hash text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 project public.projects; attempt public.translation_attempts; tier text;
 source_text text; chapter jsonb; chars integer; completed bigint; outstanding bigint;
 bucket date; now_at timestamptz:=clock_timestamp(); remaining bigint; result_text text;
begin
 select * into project from public.projects where id=target_project;
 if not found then raise exception 'Project access required'; end if;
 if project.owner_id<>target_actor and not exists(
   select 1 from public.project_collaborators where project_id=target_project and user_id=target_actor and role='editor'
 ) then raise exception 'Editor access required'; end if;
 if target_environment not in ('sandbox','production') then raise exception 'Invalid billing environment'; end if;
 if operation not in ('status','reserve','heartbeat','commit','release') then raise exception 'Invalid quota operation'; end if;
 -- Serialize the caller's allowance across every owned or shared project.
 perform pg_advisory_xact_lock(hashtextextended(target_actor::text || ':translation:' || target_environment,0));
 tier:=public.account_tier(target_actor,target_environment);
 if tier<>'free' then return jsonb_build_object('unlimited',true,'tier',tier); end if;
 bucket:=(now_at at time zone 'UTC')::date;
 if operation<>'status' then
   if attempt_id is null then raise exception 'Translation attempt ID required'; end if;
   select * into attempt from public.translation_attempts where id=attempt_id for update;
   if found then
     if attempt.actor_id<>target_actor or attempt.project_id<>target_project or attempt.environment<>target_environment then
       raise exception 'Translation attempt access denied';
     end if;
     bucket:=attempt.day;
     if attempt.state='completed' then return jsonb_build_object('state','completed','characters',attempt.characters); end if;
   elsif operation not in ('reserve') then raise exception 'Translation attempt not found';
   end if;
 end if;
 select coalesce(sum(characters) filter(where state='completed'),0),
   coalesce(sum(characters) filter(where state='reserved' and expires_at>now_at and id is distinct from attempt_id),0)
 into completed,outstanding from public.translation_attempts
 where actor_id=target_actor and environment=target_environment and day=bucket;
 remaining:=greatest(0,30000-completed-outstanding);
 if operation='status' then
   return jsonb_build_object('unlimited',false,'completed',completed,'reserved',outstanding,'remaining',remaining,
     'resetAt',((bucket+1)::timestamp at time zone 'UTC'));
 end if;
 if operation='release' then
   update public.translation_attempts set state='released' where id=attempt_id;
   return jsonb_build_object('state','released');
 end if;
 select value into chapter from jsonb_array_elements(project.snapshot->'novel'->'chapters') where value->>'id'=coalesce(target_chapter,attempt.chapter_id);
 if chapter is null or jsonb_typeof(chapter->'text')<>'string' then raise exception 'Saved source chapter required'; end if;
 source_text:=chapter->>'text';
 -- PostgreSQL UTF-8 char_length counts Unicode code points, not UTF-16 units.
 chars:=char_length(source_text);
 if attempt.id is not null and (attempt.chapter_id<>chapter->>'id' or attempt.source_hash<>md5(source_text)) then
   raise exception 'Source changed; start a new translation attempt';
 end if;
 if chars>remaining then
   return jsonb_build_object('blocked',true,'required',chars,'remaining',remaining,'completed',completed,
     'resetAt',((bucket+1)::timestamp at time zone 'UTC'));
 end if;
 if operation='commit' then
   if attempt.state='released' then raise exception 'Translation attempt released'; end if;
   result_text:=project.snapshot->'translations'->>attempt.chapter_id;
   if coalesce(result_text,'')='' or result_text like '%PARTIAL' or (project.snapshot->'partialResumes') ? attempt.chapter_id then
     raise exception 'Full translation must be saved before committing usage';
   end if;
   if target_output_hash is null or encode(sha256(convert_to(result_text,'UTF8')),'hex')<>target_output_hash then
     raise exception 'Completed output has not been saved';
   end if;
   update public.translation_attempts set state='completed',completed_at=now_at where id=attempt_id;
   return jsonb_build_object('state','completed','characters',chars,'completed',completed+chars);
 end if;
 if operation='heartbeat' and attempt.state='released' then raise exception 'Translation attempt released'; end if;
 insert into public.translation_attempts(id,owner_id,actor_id,project_id,environment,chapter_id,source_hash,characters,day,state,expires_at)
 values(attempt_id,project.owner_id,target_actor,target_project,target_environment,chapter->>'id',md5(source_text),chars,bucket,'reserved',now_at+interval '30 minutes')
 on conflict(id) do update set state='reserved',expires_at=excluded.expires_at;
 return jsonb_build_object('state','reserved','characters',chars,'remaining',remaining-chars,
   'expiresAt',now_at+interval '30 minutes','resetAt',((bucket+1)::timestamp at time zone 'UTC'));
end; $$;

create or replace function public.append_checked_document(actor uuid,target_project uuid,operation_id uuid,update_bytes bytea,expected_revision bigint,validated_tier text)
returns void language plpgsql security definer set search_path='' as $$
declare actual_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended((select owner_id::text from public.projects where id=target_project)||':cloud',0));
 if not public.project_actor_can_edit(target_project,actor) then raise exception 'Editor access required'; end if;
 if public.launch_tier(actor) is distinct from validated_tier then raise exception 'Plan changed; retry with current permissions'; end if;
 select update_revision into actual_revision from public.project_documents where project_id=target_project for update;
 if exists(select 1 from public.project_document_updates where project_id=target_project and update_id=operation_id) then
   if not exists(select 1 from public.project_document_updates where project_id=target_project and update_id=operation_id and author_id=actor and payload=update_bytes)
   then raise exception 'Operation identifier already used'; end if;
   return;
 end if;
 if actual_revision is distinct from expected_revision then raise exception 'Document changed; retry with current state'; end if;
 if (select coalesce(sum(octet_length(payload)),0) from public.project_document_updates where project_id=target_project)+octet_length(update_bytes)>50000000
 then raise exception 'Document update capacity reached; export a backup'; end if;
 insert into public.project_document_updates(project_id,update_id,author_id,payload) values(target_project,operation_id,actor,update_bytes);
 update public.project_documents set update_revision=update_revision+1 where project_id=target_project;
end; $$;

create or replace function public.reserve_cloud_upload(target_project uuid,object_name text,upload_bytes bigint) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid; tier text; existing_bytes bigint; project_limit integer;
begin
 if auth.uid() is null or upload_bytes not between 1 and 52428800 then raise exception 'Invalid upload'; end if;
 select owner_id into account from public.projects where id=target_project;
 if account is null then
   account:=auth.uid();
   if object_name<>account::text||'/'||target_project::text||'/original' then raise exception 'Invalid original path'; end if;
 else
   if not public.can_edit_document(target_project) or public.launch_tier(auth.uid())='free'
      or object_name not like account::text||'/'||target_project::text||'/images/%' then raise exception 'Image replacement requires editor access and a personal Pro plan'; end if;
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

create or replace function public.project_entitlements(target_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.projects; tier text; owner_tier text; prompt text;
begin
 select * into p from public.projects where id=target_project;
 if not found or not public.can_access_project(target_project) then raise exception 'Project access required'; end if;
 tier:=public.launch_tier(auth.uid()); owner_tier:=public.launch_tier(p.owner_id);
 select custom_instructions into prompt from public.project_launch_preferences where project_id=p.id;
 return jsonb_build_object('tier',tier,'limits',public.launch_limits(tier),
   'ownerTier',owner_tier,'projectLimits',public.launch_limits(owner_tier),'isOwner',p.owner_id=auth.uid(),
   'editable',public.project_actor_can_edit(p.id,auth.uid()),
   'customInstructions',case when tier='advanced' then coalesce(prompt,'') else '' end);
end; $$;
