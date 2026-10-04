-- Explicit grants can survive REVOKE FROM PUBLIC in dashboard-created schemas.
-- Only verified server webhook handlers may modify the Paddle mirror.
revoke execute on function
 public.upsert_paddle_customer(text,text,timestamptz,text),
 public.upsert_paddle_subscription(text,text,text,text,text,text,timestamptz,timestamptz,text),
 public.upsert_paddle_transaction(text,text,text,timestamptz,timestamptz,text)
 from public,anon,authenticated;
grant execute on function
 public.upsert_paddle_customer(text,text,timestamptz,text),
 public.upsert_paddle_subscription(text,text,text,text,text,text,timestamptz,timestamptz,text),
 public.upsert_paddle_transaction(text,text,text,timestamptz,timestamptz,text)
 to service_role;
