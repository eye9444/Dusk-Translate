import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {launchDatabase,asUser,asAdmin} from './helpers/launch-db.mjs';

async function account(db,paid=false) {
  const id=randomUUID();
  await asAdmin(db);
  await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@test.invalid`]);
  if(paid) {
    await db.query("insert into customers(customer_id,user_id,environment) values($1,$2,'sandbox')",[`ctm_${id}`,id]);
    await db.query("select upsert_paddle_subscription($1,$2,'active','pri_01m3ytbd6gcsryxwe8fbfadsgz','product',null,null,now(),$3)",[`sub_${id}`,`ctm_${id}`,`event_${id}`]);
  }
  return id;
}
async function project(db,owner) {
  const id=randomUUID();
  await asUser(db,owner);
  await db.query("insert into projects(id,owner_id,title,file_name,file_path) values($1,$2,'Book','book.epub',$3)",[id,owner,`${owner}/${id}/original`]);
  return id;
}

test('image replacement binds owner, project, image, and MIME while preserving valid replacements',async()=>{
  const db=await launchDatabase();
  try {
    const owner=await account(db,true),other=await account(db,true);
    const a=await project(db,owner),b=await project(db,other);
    await db.query("select share_project($1,$2,'editor')",[b,`${owner}@test.invalid`]);
    await asUser(db,owner);
    const images=[];
    for(const [p,o] of [[a,owner],[a,owner],[b,other]]) {
      const id=randomUUID(),path=`${o}/${p}/images/${id}/replacement.png`;
      await db.query("select register_project_image($1,$2,$3,100,'image/png')",[p,id,`${id}.png`]);
      await db.query('select reserve_cloud_upload($1,$2,100)',[p,path]);
      await db.query("insert into storage.objects(bucket_id,name,metadata) values('books',$1,'{\"size\":100,\"mimetype\":\"image/png\"}')",[path]);
      images.push({id,path});
    }
    const replace=(path,mime='image/png',bytes=100)=>db.query(
      'select (set_project_image_replacement($1,$2,$3,$4,$5,10,10)).replacement_path as path',
      [a,images[0].id,path,bytes,mime]);
    assert.equal((await replace(images[0].path)).rows[0].path,images[0].path);
    for(const path of [images[1].path,images[2].path,images[0].path.replace(owner,other),null]) {
      await assert.rejects(replace(path),/must belong to the target project and image/);
    }
    await assert.rejects(replace(images[0].path,'image/jpeg'),/must belong/);
    await assert.rejects(replace(images[0].path,'image/png',99),/missing or invalid/);
    assert.equal((await db.query('select replacement_path from project_image_assets where id=$1',[images[0].id])).rows[0].replacement_path,images[0].path);
    await db.query('select clear_project_image_replacement($1,$2)',[a,images[0].id]);
    assert.equal((await db.query('select replacement_path from project_image_assets where id=$1',[images[0].id])).rows[0].replacement_path,null);
    await asUser(db,other);
    await assert.rejects(replace(images[0].path),/Editor access required/);
  } finally {await db.close();}
});

test('private comment posting allowance survives message and thread deletion, remains scoped, and expires',async()=>{
  const db=await launchDatabase();
  try {
    const owner=await account(db),editor=await account(db);
    const p=await project(db,owner),q=await project(db,owner);
    await db.query("select share_project($1,$2,'editor')",[p,`${editor}@test.invalid`]);
    const anchor={quote:'x',chapterId:'one',prefix:'',suffix:'',start:0,end:1,pane:'source'};
    const create=async(target=p)=>(await db.query("select write_project_comment($1,'create',null,'Comment',$2) as id",[target,anchor])).rows[0].id;
    const write=(action,id,body=null)=>db.query('select write_project_comment($1,$2,$3,$4)',[p,action,id,body]);
    const thread=await create();
    await asUser(db,editor);
    for(let n=0;n<30;n++) {
      if(n%2===0) {
        const reply=(await write('reply',thread,'Reply')).rows[0].write_project_comment;
        await write('delete',reply);
      } else {
        await write('delete-thread',await create());
      }
    }
    await assert.rejects(create(),/Please wait/);
    await assert.rejects(write('reply',thread,'Blocked'),/Please wait/);
    assert.equal((await db.query('select list_project_comments($1) as threads',[p])).rows[0].threads.length,1);
    // Another project and another author have independent allowances.
    const editorProject=await project(db,editor);
    await create(editorProject);
    await asUser(db,owner);
    await create(q);
    await write('reply',thread,'Owner reply');
    // Deleting another author's comments as owner cannot refund their allowance.
    await write('delete-thread',thread);
    await asUser(db,editor);
    await assert.rejects(create(),/Please wait/);
    for(const sql of ['select * from project_comment_postings','delete from project_comment_postings','select enforce_project_comment_posting_rate()']) {
      await assert.rejects(db.query(sql),/permission denied/);
    }
    await db.exec('reset role;set role anon');
    await assert.rejects(db.query('select * from project_comment_postings'),/permission denied/);
    await assert.rejects(db.query('select enforce_project_comment_posting_rate()'),/permission denied/);
    await asAdmin(db);
    assert.equal((await db.query('select count(*)::int as total from project_comment_postings where project_id=$1 and author_id=$2',[p,editor])).rows[0].total,30);
    await db.query("update project_comment_postings set posted_at=now()-interval '2 minutes' where project_id=$1 and author_id=$2",[p,editor]);
    await asUser(db,editor);
    await create();
    await asAdmin(db);
    assert.equal((await db.query('select count(*)::int as total from project_comment_postings where project_id=$1 and author_id=$2',[p,editor])).rows[0].total,1);
  } finally {await db.close();}
});

test('migration preserves recent pre-existing postings after owner deletion',async()=>{
  const db=await launchDatabase();
  try {
    // Reconstruct the prior comment schema only inside this disposable database.
    await db.exec('drop trigger project_comment_posting_rate on public.project_comments; drop function public.enforce_project_comment_posting_rate(); drop table public.project_comment_postings;');
    const owner=await account(db),editor=await account(db),p=await project(db,owner);
    await db.query("select share_project($1,$2,'editor')",[p,`${editor}@test.invalid`]);
    await asUser(db,editor);
    const anchor={quote:'x',chapterId:'one',prefix:'',suffix:'',start:0,end:1,pane:'source'};
    const thread=(await db.query("select write_project_comment($1,'create',null,'First',$2) as id",[p,anchor])).rows[0].id;
    for(let n=1;n<30;n++) await db.query("select write_project_comment($1,'reply',$2,'Reply')",[p,thread]);
    await asAdmin(db);
    await db.exec(await readFile(new URL('../supabase/migrations/202610050004_image_comment_security.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('select count(*)::int as total from project_comment_postings')).rows[0].total,30);
    await asUser(db,owner);
    await db.query("select write_project_comment($1,'delete-thread',$2)",[p,thread]);
    await asUser(db,editor);
    await assert.rejects(db.query("select write_project_comment($1,'create',null,'Blocked',$2)",[p,anchor]),/Please wait/);
  } finally {await db.close();}
});
