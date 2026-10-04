import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {launchDatabase,asUser,asAdmin} from './helpers/launch-db.mjs';

test('personal quotas and tools do not inherit owner billing; owner still supplies seats',async()=>{
 const db=await launchDatabase(),owner=randomUUID(),member=randomUUID(),project=randomUUID();
 const attempt=randomUUID(),next=randomUUID();
 const source='a'.repeat(16000),snapshot={novel:{chapters:[{id:'one',text:source}]},translations:{one:'Done'}};
 const quota=async(actor,operation,id)=> (await db.query('select translation_quota($1,\'sandbox\',$2,$3,$4,\'one\',$5) as result',
  [actor,project,operation,id,createHash('sha256').update('Done').digest('hex')])).rows[0].result;
 try{
  for(const [id,email] of [[owner,'owner@personal.invalid'],[member,'member@personal.invalid']])await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
  await db.query("insert into customers(customer_id,user_id,environment) values('ctm_personal',$1,'sandbox')",[owner]);
  await db.exec("select upsert_paddle_subscription('sub_personal','ctm_personal','active','pri_01m41bn725t30w2ta3zjf181mx','product',null,null,now(),'event')");
  await db.query("insert into projects(id,owner_id,title,file_name,file_path,snapshot) values($1,$2,'Book','book.epub',$3,$4)",[project,owner,`${owner}/${project}/original`,snapshot]);
  await asUser(db,owner);
  await db.query('select create_project_invitations($1,$2)',[project,[{email:'member@personal.invalid',role:'editor'}]]);
  await asUser(db,member);
  const invite=(await db.query('select * from list_my_project_invitations()')).rows[0];
  await db.query('select respond_to_project_invitation($1,true)',[invite.id]);
  const e=(await db.query('select project_entitlements($1) as result',[project])).rows[0].result;
  assert.equal(e.tier,'free');assert.equal(e.ownerTier,'pro');assert.equal(e.projectLimits.seats,5);
  await asAdmin(db);
  assert.equal((await quota(member,'reserve',attempt)).characters,16000);
  assert.equal((await quota(member,'commit',attempt)).completed,16000);
  assert.equal((await quota(member,'reserve',next)).remaining,14000);
  assert.equal((await quota(member,'reserve',next)).blocked,true);
  assert.equal((await quota(owner,'reserve',randomUUID())).unlimited,true);
  await db.exec("update subscriptions set status='canceled'");
  assert.equal((await quota(owner,'status',null)).completed,0);
  assert.equal((await quota(owner,'status',null)).remaining,30000);
  assert.equal((await quota(member,'status',null)).completed,16000);
  await db.query("update customers set user_id=$1 where customer_id='ctm_personal'",[member]);
  await db.exec("update subscriptions set status='active'");
  assert.equal((await quota(member,'reserve',randomUUID())).unlimited,true);
  await asUser(db,member);
  const ownPlan=(await db.query('select project_entitlements($1) as result',[project])).rows[0].result;
  assert.equal(ownPlan.tier,'pro');assert.equal(ownPlan.ownerTier,'free');assert.equal(ownPlan.projectLimits.seats,2);
  const image=randomUUID(),path=`${owner}/${project}/images/${image}/replacement.png`;
  await db.query("select register_project_image($1,$2,'image.png',100,'image/png')",[project,image]);
  for(const size of [100,120]){
    await db.query('select reserve_cloud_upload($1,$2,$3)',[project,path,size]);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('books',$1,$2) on conflict(bucket_id,name) do update set metadata=excluded.metadata",[path,{size,mimetype:'image/png'}]);
  }
  await asAdmin(db);
  assert.equal((await db.query('select state from cloud_upload_reservations where object_name=$1',[path])).rows[0].state,'uploaded');
  assert.equal((await db.query('select metadata from storage.objects where name=$1',[path])).rows[0].metadata.size,120);
 }finally{await db.close();}
});
