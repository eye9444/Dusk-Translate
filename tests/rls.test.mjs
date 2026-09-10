import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Postgres policies isolate owners and revisions reject stale saves',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id serial primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
      grant usage on schema public,auth,storage to anon,authenticated;
      grant select,insert,delete on storage.objects to authenticated;
      grant usage,select on sequence storage.objects_id_seq to authenticated;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
    `);
    await db.exec(await readFile('supabase/migrations/202609100001_projects.sql','utf8'));
    const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
    await db.query('insert into projects(id,owner_id,title,file_name,file_path) values ($1,$2,$3,$4,$5)',[id,a,'A book','book.epub',`${a}/${id}/original`]);
    await db.query("insert into storage.objects(bucket_id,name) values ('books',$1)",[`${a}/${id}/original`]);
    assert.equal((await db.query('select * from projects')).rows.length,1);
    assert.equal((await db.query('update projects set title=$1 where id=$2 and revision=1 returning revision',['Updated',id])).rows[0].revision,2);
    assert.equal((await db.query('update projects set title=$1 where id=$2 and revision=1 returning revision',['Stale',id])).rows.length,0);
    await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
    assert.equal((await db.query('select * from projects')).rows.length,0);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    assert.equal((await db.query('update projects set title=$1 where id=$2 returning id',['Intrusion',id])).rows.length,0);
    assert.equal((await db.query('delete from projects where id=$1 returning id',[id])).rows.length,0);
    await assert.rejects(db.query('insert into projects(id,owner_id,title,file_name,file_path) values ($1,$2,$3,$4,$5)',['44444444-4444-4444-8444-444444444444',a,'Intrusion','b.epub',`${a}/44444444-4444-4444-8444-444444444444/original`]),/row-level security/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('books',$1)",[`${a}/bad/original`]),/row-level security/);
    await db.exec('reset role;set role anon;');
    await assert.rejects(db.query('select * from projects'),/permission denied/);
  } finally { await db.close(); }
});
