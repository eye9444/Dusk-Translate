import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchDatabase,asUser,asAdmin} from './helpers/launch-db.mjs';

test('storage RLS probe with null metadata is allowed; real upload still requires reservation',async()=>{
  const db=await launchDatabase(),owner=randomUUID(),project=randomUUID();
  const path=`${owner}/${project}/original`;
  try{
    await db.query('insert into auth.users(id,email) values($1,$2)',[owner,'owner@storage-probe.invalid']);
    await asUser(db,owner);
    // Supabase Storage probes RLS with null or empty metadata before the body lands.
    for (const metadata of [null, {}]) {
      await db.query("insert into storage.objects(bucket_id,name,metadata) values('books',$1,$2::jsonb)",[path,metadata===null?null:JSON.stringify(metadata)]);
      await asAdmin(db);
      assert.equal((await db.query('select count(*)::int as n from cloud_upload_reservations')).rows[0].n,0);
      await asUser(db,owner);
      await db.query('delete from storage.objects where name=$1',[path]);
    }
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name,metadata) values('books',$1,'{\"size\":100}')",[path]),
      /Reserve upload/
    );
    await db.query('select reserve_cloud_upload($1,$2,$3)',[project,path,100]);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('books',$1,'{\"size\":100}')",[path]);
    await asAdmin(db);
    assert.equal((await db.query('select state from cloud_upload_reservations where object_name=$1',[path])).rows[0].state,'uploaded');
  }finally{await db.close();}
});
