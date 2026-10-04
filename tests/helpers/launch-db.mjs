import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

export async function launchDatabase() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email varchar(255) not null unique,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id serial primary key,bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant usage,select on sequence storage.objects_id_seq to authenticated;`);
  // Match Supabase's explicit API-role grants, not only PostgreSQL PUBLIC defaults.
  await db.exec('alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;');
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
    await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  }
  return db;
}
export async function asUser(db,id){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
export async function asAdmin(db){await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");}
