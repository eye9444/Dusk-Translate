create function public.account_tier(target_user_id uuid,target_environment text)
returns text language sql stable security definer set search_path='' as $$
 select coalesce((select bp.tier from public.subscriptions s
 join public.customers c on c.customer_id=s.customer_id
 join public.billing_prices bp on bp.environment=c.environment and bp.price_id=s.price_id
 where c.user_id=target_user_id and c.environment=target_environment and s.status in ('active','trialing')
 order by case bp.tier when 'advanced' then 2 else 1 end desc limit 1),'free');
$$;
revoke all on function public.account_tier(uuid,text) from public;
grant execute on function public.account_tier(uuid,text) to service_role;

create table public.translation_attempts (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 actor_id uuid not null references auth.users(id),
 project_id uuid not null references public.projects(id),
 environment text not null check(environment in ('sandbox','production')),
 chapter_id text not null,
 source_hash text not null,
 characters integer not null check(characters>=0),
 day date not null,
 state text not null check(state in ('reserved','completed','released')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index translation_attempts_owner_day on public.translation_attempts(owner_id,environment,day);
alter table public.translation_attempts enable row level security;
revoke all on public.translation_attempts from anon,authenticated;
grant all on public.translation_attempts to service_role;

create function public.translation_quota(
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
 -- Serialize all projects/collaborators belonging to the same owner.
 perform pg_advisory_xact_lock(hashtextextended(project.owner_id::text || ':translation:' || target_environment,0));
 tier:=public.account_tier(project.owner_id,target_environment);
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
 where owner_id=project.owner_id and environment=target_environment and day=bucket;
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
revoke all on function public.translation_quota(uuid,text,uuid,text,uuid,text,text) from public;
grant execute on function public.translation_quota(uuid,text,uuid,text,uuid,text,text) to service_role;
