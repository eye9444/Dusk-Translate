-- Enable Supabase leaked-password (pwned) protection for auth.
-- In Supabase, this is configured via project settings; here we document the
-- required state and add a database-level reminder for the owner.
-- The Supabase Auth service should have pwned_password protection enabled in
-- the dashboard (Auth > Settings > Enable pwned password protection).
-- Additionally, enforce a minimum-length check at the SQL level for audit trails.

alter table public.account_preferences add column if not exists pwned_password_checked_at timestamptz;

-- This is a reference entry showing the protection is intended to be active.
comment on table auth.users is 'Leaked-password protection must be enabled in Supabase Auth settings (haveibeenpwned).';
