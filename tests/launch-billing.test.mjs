import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { resolveTier } from '../server/entitlements.js';
import { describeEntitlements, countSourceCharacters } from '../web/src/entitlements.js';
import { getPricingTiers } from '../web/src/pricing-tiers.js';

test('recognized highest eligible tier wins, never scheduled changes or unknown prices', () => {
  const prices = new Map([['pro','pro'],['advanced','advanced']]);
  const active = { price_id:'advanced',status:'active',scheduled_change_action:'cancel' };
  assert.equal(resolveTier([active,{ price_id:'pro',status:'trialing' }],prices),'advanced');
  assert.equal(resolveTier([{ price_id:'pro',status:'trialing' },active],prices),'advanced');
  for (const status of ['paused','past_due','canceled']) assert.equal(resolveTier([{...active,status}],prices),'free');
  assert.equal(resolveTier([{price_id:'unknown',status:'active'}],prices),'free');
  assert.equal(describeEntitlements('free').capabilities.rubyEdit,false);
  assert.equal(describeEntitlements('pro').capabilities.rubyEdit,true);
  assert.equal(describeEntitlements('pro').capabilities.readerLinks,false);
  assert.equal(describeEntitlements('advanced').limits.seats,10);
  assert.equal(countSourceCharacters('あ😀 e\u0301\n'),6);
  assert.throws(()=>getPricingTiers('production',''),/mapping/);
  assert.throws(()=>getPricingTiers(undefined),/environment/);
});

test('billing migration preserves event clocks and binds only verified server transactions',async()=>{
  const db = new PGlite();
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      insert into auth.users values('${owner}','literal_%@example.test',now()),('${other}','other@example.test',now());`);
    for (const file of ['202610020003_paddle_billing.sql','202610030001_billing_identity.sql']) {
      await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
    }
    await db.query("select upsert_paddle_subscription('sub_one','ctm_one','trialing','pri_01m3ytbd6gcsryxwe8fbfadsgz','pro_one',null,null,'2026-10-03T04:00:00Z','evt_sub')");
    assert.equal((await db.query("select source_event_at from customers where customer_id='ctm_one'")).rows[0].source_event_at,null);
    await db.query("select upsert_paddle_customer('ctm_one','literal_%@example.test','2026-10-03T03:00:00Z','evt_customer')");
    await db.query("select upsert_paddle_customer('ctm_one','stale@example.test','2026-10-03T02:00:00Z','evt_old')");
    assert.equal((await db.query("select email from customers where customer_id='ctm_one'")).rows[0].email,'literal_%@example.test');
    await db.query("select reconcile_sandbox_customer('ctm_one',$1)",[owner]);
    await assert.rejects(db.query("select reconcile_sandbox_customer('ctm_one',$1)",[other]),/missing customer|identity mismatch/);
    await db.query("select ensure_paddle_customer_environment('ctm_two','sandbox')");
    const association='33333333-3333-4333-8333-333333333333';
    await db.query("insert into billing_checkout_associations(id,user_id,environment,price_id,transaction_id) values($1,$2,'sandbox','pri_01m3ytbd6gcsryxwe8fbfadsgz','txn_server')",[association,other]);
    await db.query("select bind_paddle_checkout('txn_forged','ctm_two','sandbox')");
    assert.equal((await db.query("select user_id from customers where customer_id='ctm_two'")).rows[0].user_id,null);
    await db.query("select bind_paddle_checkout('txn_server','ctm_two','sandbox')");
    await db.query("select bind_paddle_checkout('txn_server','ctm_two','sandbox')");
    assert.equal((await db.query("select user_id from customers where customer_id='ctm_two'")).rows[0].user_id,other);
    await assert.rejects(db.query("select bind_paddle_checkout('txn_server','ctm_one','sandbox')"),/ownership conflict/);
    await assert.rejects(db.query("select ensure_paddle_customer_environment('ctm_one','production')"),/environment mismatch/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query("select bind_paddle_checkout('txn_server','ctm_one','sandbox')"),/permission denied/);
    await assert.rejects(db.query('select * from billing_checkout_associations'),/permission denied/);
    await assert.rejects(db.query('select * from account_preferences'),/permission denied/);
  } finally { await db.close(); }
});
