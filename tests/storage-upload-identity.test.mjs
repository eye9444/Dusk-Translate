import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchDatabase,asUser,asAdmin} from './helpers/launch-db.mjs';

test('Storage service finalization keeps uploader identity and enforces reservations',async()=>{
 const db=await launchDatabase(),owner=randomUUID(),other=randomUUID(),project=randomUUID();
 const path=`${owner}/${project}/original`;
 const insert=(actor,size)=>db.query(`insert into storage.objects(bucket_id,name,owner_id,metadata)
   values('books',$1,$2,jsonb_build_object('size',$3::int))
   on conflict(bucket_id,name) do update set metadata=excluded.metadata,owner_id=excluded.owner_id`,[path,actor,size]);
 const storage=async()=>{
   await db.exec("reset role;set session authorization supabase_storage_admin;set role service_role;select set_config('request.jwt.claim.sub','',false)");
 };
 const admin=async()=>{await db.exec('reset role;reset session authorization');await asAdmin(db);};
 try{
   await db.exec(`alter table storage.objects add column owner_id text;
     create role supabase_storage_admin superuser;
     alter role service_role bypassrls;
     grant select,insert,update on storage.objects to service_role;
     grant usage,select on sequence storage.objects_id_seq to service_role;`);
   await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'upload-owner@example.test',other,'upload-other@example.test']);
   await asUser(db,owner);
   await db.query('select reserve_cloud_upload($1,$2,100)',[project,path]);
   await storage();
   await assert.rejects(insert(other,100),/Reserve upload/);
   await assert.rejects(insert(null,100),/Reserve upload/);
   await assert.rejects(insert(owner,101),/exceeds reserved size/);
   await insert(owner,100);
   await admin();
   assert.equal((await db.query('select state from cloud_upload_reservations where object_name=$1',[path])).rows[0].state,'uploaded');
   await storage();
   await assert.rejects(insert(owner,100),/Reserve upload/);
   await admin();
   await asUser(db,owner);
   await db.query('select reserve_cloud_upload($1,$2,100)',[project,path]);
   // Replacing a file executes BEFORE INSERT and BEFORE UPDATE: consume once.
   await storage();await insert(owner,90);await admin();
   assert.equal((await db.query('select metadata from storage.objects where name=$1',[path])).rows[0].metadata.size,90);
   await asUser(db,owner);await db.query('select reserve_cloud_upload($1,$2,100)',[project,path]);
   await admin();await db.query("update cloud_upload_reservations set expires_at=now()-interval '1 second' where object_name=$1",[path]);
   await storage();await assert.rejects(insert(owner,90),/Reserve upload/);await admin();
   await asUser(db,owner);await db.query('select reserve_cloud_upload($1,$2,100)',[project,path]);
   // An API caller cannot spoof owner_id to consume somebody else's reservation.
   await asUser(db,other);await assert.rejects(insert(owner,90),/Reserve upload/);
   await admin();await db.exec('set session authorization postgres;set role service_role');
   await assert.rejects(insert(owner,90),/Reserve upload/);
 }finally{await db.close();}
});
