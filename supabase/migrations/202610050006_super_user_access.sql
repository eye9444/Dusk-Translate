-- Owner access is managed separately from Paddle so the site owner can use
-- every feature while billing and delegated tier management are developed.
create table public.super_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.super_users enable row level security;
revoke all on public.super_users from anon, authenticated;
grant all on public.super_users to service_role;

insert into public.super_users(user_id)
select id from auth.users where lower(email)=lower('ironhero109@gmail.com')
on conflict (user_id) do nothing;

create or replace function public.account_tier(target_user_id uuid,target_environment text)
returns text language sql stable security definer set search_path='' as $$
 select case when exists(
   select 1 from public.super_users where user_id=target_user_id
 ) then 'advanced' else coalesce((select bp.tier from public.subscriptions s
   join public.customers c on c.customer_id=s.customer_id
   join public.billing_prices bp on bp.environment=c.environment and bp.price_id=s.price_id
   where c.user_id=target_user_id and c.environment=target_environment and s.status in ('active','trialing')
   order by case bp.tier when 'advanced' then 2 else 1 end desc limit 1),'free') end;
$$;

revoke all on function public.account_tier(uuid,text) from public;
grant execute on function public.account_tier(uuid,text) to service_role;
