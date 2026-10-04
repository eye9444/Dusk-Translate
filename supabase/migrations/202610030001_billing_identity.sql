-- Additive migration: existing Paddle resources and mirror rows are retained.
alter table public.customers add column user_id uuid references auth.users(id);
alter table public.customers add column environment text not null default 'sandbox'
  check (environment in ('sandbox','production'));
drop index if exists public.customers_email_unique;
create index customers_account on public.customers(user_id,environment);
create index customers_exact_email on public.customers(lower(email));

create table public.billing_prices (
  environment text not null check (environment in ('sandbox','production')),
  price_id text not null,
  tier text not null check (tier in ('pro','advanced')),
  checkout_enabled boolean not null default false,
  primary key(environment,price_id)
);
insert into public.billing_prices(environment,price_id,tier,checkout_enabled) values
 ('sandbox','pri_01m3ytbd6gcsryxwe8fbfadsgz','pro',true),
 ('sandbox','pri_01m3ytbde7rh43snkbnee4atdh','pro',true),
 ('sandbox','pri_01m3ytbdymdkjgr76nqp69drc1','advanced',true),
 ('sandbox','pri_01m3ytbe6kjkrxa13zjy7gegkb','advanced',true);

create table public.billing_checkout_associations (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  environment text not null,
  price_id text not null,
  transaction_id text unique,
  customer_id text references public.customers(customer_id),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  foreign key(environment,price_id) references public.billing_prices(environment,price_id)
);
create table public.account_preferences (
  user_id uuid primary key references auth.users(id),
  dismiss_api_spending_notice boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.billing_prices enable row level security;
alter table public.billing_checkout_associations enable row level security;
alter table public.account_preferences enable row level security;
revoke all on public.billing_prices,public.billing_checkout_associations,public.account_preferences from anon,authenticated;
grant all on public.billing_prices,public.billing_checkout_associations,public.account_preferences to service_role;
grant select,insert,update on public.customers,public.subscriptions,public.paddle_transactions to service_role;

-- A missing email denotes a placeholder, never an authoritative customer event.
create or replace function public.upsert_paddle_customer(
 target_customer_id text,target_email text,target_event_at timestamptz,target_event_id text
) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(target_email,'') = '' then
   insert into public.customers(customer_id) values(target_customer_id) on conflict do nothing;
   return;
 end if;
 insert into public.customers(customer_id,email,source_event_at,source_event_id)
 values(target_customer_id,target_email,target_event_at,target_event_id)
 on conflict(customer_id) do update set email=excluded.email,source_event_at=excluded.source_event_at,
   source_event_id=excluded.source_event_id,updated_at=now()
 where customers.source_event_at is null or excluded.source_event_at > customers.source_event_at
   or (excluded.source_event_at=customers.source_event_at and excluded.source_event_id > coalesce(customers.source_event_id,''));
end; $$;

-- Correct old placeholder clocks, without changing authoritative customer data.
update public.customers set source_event_at=null,source_event_id=null where email='';

create function public.ensure_paddle_customer_environment(target_customer_id text,target_environment text)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.customers(customer_id,environment) values(target_customer_id,target_environment)
 on conflict do nothing;
 if not exists(select 1 from public.customers where customer_id=target_customer_id and environment=target_environment) then
   raise exception 'Paddle environment mismatch';
 end if;
end; $$;
revoke all on function public.ensure_paddle_customer_environment(text,text) from public;
grant execute on function public.ensure_paddle_customer_environment(text,text) to service_role;

create function public.bind_paddle_checkout(target_transaction_id text,target_customer_id text,target_environment text)
returns void language plpgsql security definer set search_path='' as $$
declare association public.billing_checkout_associations; existing_owner uuid; existing_environment text;
begin
 select * into association from public.billing_checkout_associations
 where transaction_id=target_transaction_id and environment=target_environment for update;
 if not found then return; end if;
 select user_id,environment into existing_owner,existing_environment from public.customers
 where customer_id=target_customer_id for update;
 if not found then raise exception 'Customer mirror not ready'; end if;
 if existing_environment <> target_environment or (existing_owner is not null and existing_owner <> association.user_id) then
   raise exception 'Customer ownership conflict';
 end if;
 if association.customer_id is not null and association.customer_id <> target_customer_id then
   raise exception 'Checkout customer conflict';
 end if;
 update public.customers set user_id=association.user_id where customer_id=target_customer_id;
 update public.billing_checkout_associations set customer_id=target_customer_id,fulfilled_at=coalesce(fulfilled_at,now())
 where id=association.id;
end; $$;
revoke all on function public.bind_paddle_checkout(text,text,text) from public;
grant execute on function public.bind_paddle_checkout(text,text,text) to service_role;

-- Explicit operator reconciliation only; never invoked by portal/status requests.
-- auth.users is authoritative for verified identity, not browser-supplied emails.
create function public.reconcile_sandbox_customer(target_customer_id text,target_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare verified_email text; candidate_count integer; candidate public.customers;
begin
 perform pg_advisory_xact_lock(hashtextextended('billing-reconcile',0));
 select lower(email) into verified_email from auth.users
 where id=target_user_id and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Verified account required'; end if;
 select count(*) into candidate_count from public.customers
 where environment='sandbox' and lower(email)=verified_email;
 if candidate_count <> 1 then raise exception 'Ambiguous or missing customer: manual review required'; end if;
 select * into candidate from public.customers where customer_id=target_customer_id for update;
 if not found or candidate.environment <> 'sandbox' or lower(candidate.email) <> verified_email
   or (candidate.user_id is not null and candidate.user_id <> target_user_id) then
   raise exception 'Customer identity mismatch';
 end if;
 update public.customers set user_id=target_user_id where customer_id=target_customer_id;
end; $$;
revoke all on function public.reconcile_sandbox_customer(text,uuid) from public;
grant execute on function public.reconcile_sandbox_customer(text,uuid) to service_role;
