import assert from 'node:assert/strict';
import test from 'node:test';
import { launchDatabase, asAdmin } from './helpers/launch-db.mjs';

test('beta access grants Teams for one month and expires without deleting the account', async () => {
  const db = await launchDatabase();
  const userId = '11111111-1111-4111-8111-111111111111';
  try {
    await db.query("insert into auth.users(id,email,created_at) values($1,'beta@example.com',now())", [userId]);
    await asAdmin(db);
    let result = await db.query("select account_tier($1,'sandbox') as tier, beta_access_until($1) as until", [userId]);
    assert.equal(result.rows[0].tier, 'advanced');
    assert.ok(new Date(result.rows[0].until) > new Date());

    await db.query("update beta_access set started_at=now()-interval '1 month' where user_id=$1", [userId]);
    result = await db.query("select account_tier($1,'sandbox') as tier from auth.users where id=$1", [userId]);
    assert.equal(result.rows[0].tier, 'free');
    assert.equal((await db.query('select count(*)::int as count from auth.users where id=$1', [userId])).rows[0].count, 1);
  } finally {
    await db.close();
  }
});
