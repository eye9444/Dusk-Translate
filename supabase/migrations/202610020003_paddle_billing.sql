-- Paddle is the billing source of truth. These rows are an idempotent local
-- mirror used for entitlement checks and authenticated portal sessions.
create table if not exists public.customers (
  customer_id text primary key,
  email text not null default '',
  source_event_at timestamptz,
  source_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customers_email_unique on public.customers (lower(email)) where email <> '';

create table if not exists public.subscriptions (
  subscription_id text primary key,
  customer_id text not null references public.customers(customer_id),
  status text not null,
  price_id text not null,
  product_id text not null,
  scheduled_change_action text,
  scheduled_change_at timestamptz,
  source_event_at timestamptz,
  source_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_customer_updated on public.subscriptions(customer_id, updated_at desc);
create index if not exists subscriptions_status on public.subscriptions(status);

create table if not exists public.paddle_transactions (
  transaction_id text primary key,
  customer_id text not null references public.customers(customer_id),
  status text not null,
  completed_at timestamptz,
  source_event_at timestamptz,
  source_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists paddle_transactions_customer_updated on public.paddle_transactions(customer_id, updated_at desc);

alter table public.customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.paddle_transactions enable row level security;
revoke all on public.customers, public.subscriptions, public.paddle_transactions from anon, authenticated;

create or replace function public.upsert_paddle_customer(
  target_customer_id text,
  target_email text,
  target_event_at timestamptz,
  target_event_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.customers(customer_id,email,source_event_at,source_event_id)
  values(target_customer_id,coalesce(target_email,''),target_event_at,target_event_id)
  on conflict(customer_id) do update set
    email = case when excluded.email <> '' then excluded.email else public.customers.email end,
    source_event_at = excluded.source_event_at,
    source_event_id = excluded.source_event_id,
    updated_at = now()
  where public.customers.source_event_at is null
     or excluded.source_event_at >= public.customers.source_event_at;
end;
$$;

create or replace function public.upsert_paddle_subscription(
  target_subscription_id text,
  target_customer_id text,
  target_status text,
  target_price_id text,
  target_product_id text,
  target_scheduled_change_action text,
  target_scheduled_change_at timestamptz,
  target_event_at timestamptz,
  target_event_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.upsert_paddle_customer(target_customer_id,null,target_event_at,target_event_id);
  insert into public.subscriptions(
    subscription_id,customer_id,status,price_id,product_id,
    scheduled_change_action,scheduled_change_at,source_event_at,source_event_id
  ) values(
    target_subscription_id,target_customer_id,target_status,target_price_id,target_product_id,
    target_scheduled_change_action,target_scheduled_change_at,target_event_at,target_event_id
  )
  on conflict(subscription_id) do update set
    customer_id = excluded.customer_id,
    status = excluded.status,
    price_id = excluded.price_id,
    product_id = excluded.product_id,
    scheduled_change_action = excluded.scheduled_change_action,
    scheduled_change_at = excluded.scheduled_change_at,
    source_event_at = excluded.source_event_at,
    source_event_id = excluded.source_event_id,
    updated_at = now()
  where public.subscriptions.source_event_at is null
     or excluded.source_event_at >= public.subscriptions.source_event_at;
end;
$$;

create or replace function public.upsert_paddle_transaction(
  target_transaction_id text,
  target_customer_id text,
  target_status text,
  target_completed_at timestamptz,
  target_event_at timestamptz,
  target_event_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.upsert_paddle_customer(target_customer_id,null,target_event_at,target_event_id);
  insert into public.paddle_transactions(
    transaction_id,customer_id,status,completed_at,source_event_at,source_event_id
  ) values(
    target_transaction_id,target_customer_id,target_status,target_completed_at,target_event_at,target_event_id
  )
  on conflict(transaction_id) do update set
    customer_id = excluded.customer_id,
    status = excluded.status,
    completed_at = excluded.completed_at,
    source_event_at = excluded.source_event_at,
    source_event_id = excluded.source_event_id,
    updated_at = now()
  where public.paddle_transactions.source_event_at is null
     or excluded.source_event_at >= public.paddle_transactions.source_event_at;
end;
$$;

revoke all on function public.upsert_paddle_customer(text,text,timestamptz,text) from public;
revoke all on function public.upsert_paddle_subscription(text,text,text,text,text,text,timestamptz,timestamptz,text) from public;
revoke all on function public.upsert_paddle_transaction(text,text,text,timestamptz,timestamptz,text) from public;
grant execute on function public.upsert_paddle_customer(text,text,timestamptz,text) to service_role;
grant execute on function public.upsert_paddle_subscription(text,text,text,text,text,text,timestamptz,timestamptz,text) to service_role;
grant execute on function public.upsert_paddle_transaction(text,text,text,timestamptz,timestamptz,text) to service_role;
