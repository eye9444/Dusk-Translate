import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchDatabase,asUser,asAdmin} from './helpers/launch-db.mjs';

test('community access unlocks features without granting admin or stranger project access', async()=>{
  const db=await launchDatabase({communityAccess:true});
  const owner=randomUUID(), stranger=randomUUID(), project=randomUUID();
  try {
    for(const id of [owner,stranger]) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@test.invalid`]);
    assert.equal((await db.query("select account_tier($1,'sandbox') as tier",[owner])).rows[0].tier,'advanced');
    assert.equal((await db.query('select count(*)::int as count from super_users')).rows[0].count,0);
    await db.query("insert into projects(id,owner_id,title,file_name,file_path,snapshot) values($1,$2,'Novel','novel.json',$3,$4)",[project,owner,`${owner}/${project}/original`,{novel:{chapters:[]},translations:{}}]);
    await asUser(db,owner);
    assert.equal((await db.query('select project_entitlements($1) as rights',[project])).rows[0].rights.tier,'advanced');
    await asUser(db,stranger);
    assert.equal((await db.query('select can_access_project($1) as allowed',[project])).rows[0].allowed,false);
    await assert.rejects(db.query('update launch_configuration set community_access=false'),/permission denied/);
    await asAdmin(db);
    await db.exec('update launch_configuration set community_access=false');
    assert.equal((await db.query("select account_tier($1,'sandbox') as tier",[owner])).rows[0].tier,'free');
  } finally {await db.close();}
});
