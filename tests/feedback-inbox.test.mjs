import assert from 'node:assert/strict';
import test from 'node:test';
import { asAdmin, asUser, launchDatabase } from './helpers/launch-db.mjs';

test('feedback is write-only for reporters and visible only to the founder inbox', async () => {
  const db=await launchDatabase();
  const founder='11111111-1111-4111-8111-111111111111', reporter='22222222-2222-4222-8222-222222222222';
  try {
    await db.query("insert into auth.users(id,email) values($1,'ironhero109@gmail.com'),($2,'reader@example.com')",[founder,reporter]);
    await asAdmin(db);await db.query('insert into super_users(user_id) values($1)',[founder]);
    await asUser(db,reporter);
    assert.equal((await db.query('select is_feedback_admin() as allowed')).rows[0].allowed,false);
    await db.query("select submit_feedback('bug','The reader button does not open on mobile',null)");
    await assert.rejects(db.query('select * from feedback_reports'),/permission denied/i);
    assert.equal((await db.query('select count(*)::int as count from list_feedback_inbox()')).rows[0].count,0);
    await assert.rejects(db.query("select submit_feedback('bug','short',null)"),/between 10 and 5,000/i);
    await asUser(db,founder);
    assert.equal((await db.query('select is_feedback_admin() as allowed')).rows[0].allowed,true);
    const inbox=await db.query('select * from list_feedback_inbox()');
    assert.equal(inbox.rows.length,1);
    assert.equal(inbox.rows[0].reporter_email,'reader@example.com');
    await asUser(db,reporter);
    await assert.rejects(db.query('select delete_feedback_report($1)',[inbox.rows[0].id]),/permission denied/i);
    await asUser(db,founder);
    await db.query('select delete_feedback_report($1)',[inbox.rows[0].id]);
    assert.equal((await db.query('select * from list_feedback_inbox()')).rows.length,0);
  } finally { await db.close(); }
});
