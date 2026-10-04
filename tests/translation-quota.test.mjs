import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('quota is owner-wide, atomic, idempotent, Unicode aware, and tied to durable full output', async()=>{
  const db=new PGlite();
  const owner=randomUUID(),editor=randomUUID(),stranger=randomUUID(),project=randomUUID(),second=randomUUID();
  const attempt=()=>randomUUID();
  const digest=text=>createHash('sha256').update(text).digest('hex');
  const quota=async(operation,id=null,chapter='one',actor=owner,pid=project,outputHash=null)=>
    (await db.query('select translation_quota($1,\'sandbox\',$2,$3,$4,$5,$6) as result',[actor,pid,operation,id,chapter,outputHash])).rows[0].result;
  const save=async(text,output='',partials={})=>db.query('update projects set snapshot=$1 where id=$2',[
    {novel:{chapters:[{id:'one',text}]},translations:{one:output},partialResumes:partials},project]);
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create table public.projects(id uuid primary key,owner_id uuid references auth.users(id),snapshot jsonb);
      create table public.project_collaborators(project_id uuid,user_id uuid,role text);`);
    for(const id of [owner,editor,stranger])await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@test.invalid']);
    for(const file of ['202610020003_paddle_billing.sql','202610030001_billing_identity.sql','202610030002_translation_quota.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
    for(const id of [project,second])await db.query('insert into projects values($1,$2,$3)',[id,owner,{novel:{chapters:[{id:'one',text:'a'.repeat(16000)}]}}]);
    await db.query("insert into project_collaborators values($1,$2,'editor')",[project,editor]);
    await assert.rejects(quota('reserve',attempt(),'one',stranger),/Editor access/);
    const first=attempt();
    assert.equal((await quota('reserve',first)).characters,16000);
    assert.equal((await quota('reserve',first)).characters,16000);
    assert.equal((await quota('status')).reserved,16000);
    assert.equal((await quota('reserve',attempt(),'one',owner,second)).blocked,true);
    assert.equal((await quota('reserve',attempt(),'one',editor)).remaining,14000);
    await assert.rejects(quota('commit',first),/Full translation/);
    await save('a'.repeat(16000),'Complete');
    await assert.rejects(quota('commit',first,'one',owner,project,digest('Other output')),/not been saved/);
    assert.equal((await quota('commit',first,'one',owner,project,digest('Complete'))).completed,16000);
    assert.equal((await quota('commit',first,'one',owner,project,digest('Complete'))).state,'completed');
    assert.equal((await quota('status')).completed,16000);
    assert.equal((await quota('reserve',attempt())).remaining,14000);
    const exact=attempt();await save('😀'.repeat(14000));
    assert.equal((await quota('reserve',exact)).characters,14000);
    await save('😀'.repeat(14000),'Partial',{one:{chunkIndex:0}});
    await assert.rejects(quota('commit',exact,'one',owner,project,digest('Partial')),/Full translation/);
    await quota('release',exact);
    assert.equal((await quota('status')).remaining,14000);
    await assert.rejects(quota('commit',exact,'one',owner,project,digest('Partial')),/released/);
    const completed=attempt();await save('😀'.repeat(14000),'Complete');
    await quota('reserve',completed);await quota('commit',completed,'one',owner,project,digest('Complete'));
    assert.equal((await quota('status')).completed,30000);
    assert.equal((await quota('status')).remaining,0);
    // Keep historical rows and move their bucket back to model UTC rollover.
    await db.exec("update translation_attempts set day=day-1");
    assert.equal((await quota('status')).remaining,30000);
    await save('a'.repeat(30001));assert.equal((await quota('reserve',attempt())).blocked,true);
    await save('あ😀 e\u0301\n');
    const unicode=attempt();assert.equal((await quota('reserve',unicode)).characters,6);
    await db.query("update translation_attempts set expires_at=now()-interval '1 minute',day=day-1 where id=$1",[unicode]);
    await save('あ😀 e\u0301\n','Complete');
    // Original day is already full: an expired lease cannot steal new-day capacity.
    assert.equal((await quota('heartbeat',unicode)).blocked,true);
    await quota('release',unicode);
    const lease=attempt();await quota('reserve',lease);
    await db.query("update translation_attempts set expires_at=now()-interval '1 minute' where id=$1",[lease]);
    assert.equal((await quota('status')).reserved,0);
    assert.equal((await quota('heartbeat',lease)).state,'reserved');
    await assert.rejects(quota('heartbeat',lease,'one',editor),/access denied/);
    await db.exec('set role authenticated');
    await assert.rejects(quota('status'),/permission denied/);
  }finally{await db.close();}
});
