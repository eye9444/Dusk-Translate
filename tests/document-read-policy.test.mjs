import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { launchDatabase, asUser, asAdmin } from './helpers/launch-db.mjs';

test('document reads bind identity to the session and preserve owner/editor isolation', async () => {
  const db = await launchDatabase();
  const owner = randomUUID(), editor = randomUUID(), outsider = randomUUID(), project = randomUUID();
  try {
    for (const [id, email] of [[owner, 'owner@example.test'], [editor, 'editor@example.test'], [outsider, 'other@example.test']]) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, email]);
    }
    await db.query("insert into projects(id,owner_id,title,file_name,file_path,snapshot) values($1,$2,'Book','book.txt',$3,'{}')", [project, owner, `${owner}/${project}/original`]);
    await db.query("insert into project_collaborators(project_id,user_id,role,added_by) values($1,$2,'editor',$3)", [project, editor, owner]);
    await db.query("insert into project_documents(project_id,seed) values($1,'\\x00')", [project]);
    await db.query("insert into project_document_updates(project_id,update_id,author_id,payload) values($1,$2,$3,'\\x00')", [project, randomUUID(), owner]);
    for (const actor of [owner, editor, outsider]) {
      await asUser(db, actor);
      const allowed = actor !== outsider;
      assert.equal((await db.query('select can_read_project_document($1) as allowed', [project])).rows[0].allowed, allowed);
      for (const table of ['project_documents', 'project_document_updates']) {
        assert.equal((await db.query(`select * from ${table}`)).rows.length, allowed ? 1 : 0);
      }
      await assert.rejects(db.query('select project_actor_can_read_document($1,$2)', [project, owner]), /permission denied/);
    }
    await asAdmin(db);
    await db.query("update project_collaborators set role='viewer' where project_id=$1", [project]);
    await asUser(db, editor);
    assert.equal((await db.query('select * from project_documents')).rows.length, 0);
    await asAdmin(db);
    await db.exec('set role anon');
    await assert.rejects(db.query('select can_read_project_document($1)', [project]), /permission denied/);
  } finally { await db.close(); }
});
