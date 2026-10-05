-- Super-user access: site owner can set any account's plan tier without Paddle.
create table public.super_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.super_users enable row level security;
revoke all on public.super_users from anon, authenticated;
grant all on public.super_users to service_role;

create function public.is_super_user(target_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.super_users where user_id = target_user_id);
$$;
revoke all on function public.is_super_user(uuid) from public;
grant execute on function public.is_super_user(uuid) to service_role, authenticated;
