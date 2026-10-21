-- Product access is separate from administrative privileges and billing records.
-- Set false only in an isolated paid-plan test database.
alter table public.launch_configuration
  add column community_access boolean not null default true;

alter function public.account_tier(uuid,text) rename to subscription_account_tier;
revoke all on function public.subscription_account_tier(uuid,text) from public,anon,authenticated;

create function public.account_tier(target_user_id uuid,target_environment text)
returns text language sql stable security definer set search_path='' as $$
  select case
    when exists(select 1 from public.launch_configuration where singleton and community_access)
      and exists(select 1 from auth.users where id=target_user_id) then 'advanced'
    else public.subscription_account_tier(target_user_id,target_environment)
  end;
$$;
revoke all on function public.account_tier(uuid,text) from public,anon,authenticated;
grant execute on function public.account_tier(uuid,text) to service_role;
