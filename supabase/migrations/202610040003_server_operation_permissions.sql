-- Supabase can grant API roles EXECUTE explicitly through default privileges.
-- These operations accept a server-verified actor, never a browser-supplied one.
do $$
declare operation record;
begin
 for operation in
   select p.oid::regprocedure as signature from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in (
     'ensure_paddle_customer_environment','bind_paddle_checkout',
     'reconcile_sandbox_customer','account_tier','translation_quota',
     'translation_quota_accounting','initialize_checked_document','append_checked_document',
     'initialize_project_document','append_project_document_update'
   )
 loop
   execute format('revoke execute on function %s from public,anon,authenticated',operation.signature);
 end loop;
end; $$;

grant execute on function public.ensure_paddle_customer_environment(text,text),
 public.bind_paddle_checkout(text,text,text),public.reconcile_sandbox_customer(text,uuid),
 public.account_tier(uuid,text),public.translation_quota(uuid,text,uuid,text,uuid,text,text),
 public.initialize_checked_document(uuid,uuid,bytea),
 public.append_checked_document(uuid,uuid,uuid,bytea,bigint,text) to service_role;
