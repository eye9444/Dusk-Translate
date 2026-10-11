alter table public.account_preferences add column if not exists last_seen_release text not null default '' check(char_length(last_seen_release)<=100);
