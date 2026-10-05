-- Give every account one month of Teams access during the beta.
-- Access is time-based and non-destructive: expiry changes entitlements only.
create table if not exists public.beta_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.beta_access enable row level security;
revoke all on public.beta_access from anon, authenticated;
grant all on public.beta_access to service_role;

create or replace function public.start_beta_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.beta_access(user_id,started_at)
  values(new.id,coalesce(new.created_at,now()))
  on conflict(user_id) do nothing;
  return new;
end; $$;

drop trigger if exists start_beta_access_on_signup on auth.users;
create trigger start_beta_access_on_signup
after insert on auth.users
for each row execute function public.start_beta_access();

-- Existing accounts join the beta when this migration is deployed.
insert into public.beta_access(user_id,started_at)
select id,now() from auth.users
on conflict(user_id) do nothing;

create or replace function public.beta_access_until(target_user_id uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select started_at + interval '1 month'
  from public.beta_access
  where user_id=target_user_id;
$$;

create or replace function public.account_tier(target_user_id uuid,target_environment text)
returns text language sql stable security definer set search_path='' as $$
 select case
   when exists(select 1 from public.super_users where user_id=target_user_id) then 'advanced'
   when coalesce(public.beta_access_until(target_user_id),'-infinity'::timestamptz)>now() then 'advanced'
   else coalesce((select bp.tier from public.subscriptions s
     join public.customers c on c.customer_id=s.customer_id
     join public.billing_prices bp on bp.environment=c.environment and bp.price_id=s.price_id
     where c.user_id=target_user_id and c.environment=target_environment and s.status in ('active','trialing')
     order by case bp.tier when 'advanced' then 2 else 1 end desc limit 1),'free')
 end;
$$;

revoke all on function public.start_beta_access() from public, anon, authenticated;
revoke all on function public.beta_access_until(uuid) from public, anon, authenticated;
revoke all on function public.account_tier(uuid,text) from public, anon, authenticated;
grant execute on function public.start_beta_access() to service_role;
grant execute on function public.beta_access_until(uuid) to service_role;
grant execute on function public.account_tier(uuid,text) to service_role;
