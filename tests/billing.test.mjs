import assert from 'node:assert/strict';
import test from 'node:test';

import { grantsPaidAccess } from '../server/billing.js';

test('only active and trialing subscriptions grant paid access', () => {
  assert.equal(grantsPaidAccess({ status: 'active' }), true);
  assert.equal(grantsPaidAccess({ status: 'trialing' }), true);
  assert.equal(grantsPaidAccess({ status: 'paused' }), false);
  assert.equal(grantsPaidAccess({ status: 'past_due' }), false);
  assert.equal(grantsPaidAccess({ status: 'canceled' }), false);
});

test('a future cancellation does not revoke current active access', () => {
  assert.equal(grantsPaidAccess({
    status: 'active',
    scheduled_change_action: 'cancel',
  }), true);
});
