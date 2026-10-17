import test from 'node:test';
import assert from 'node:assert/strict';
import {LATEST_RELEASE_ID, hasSeenLatestRelease} from '../web/src/releases.js';

test('the latest feature is announced to accounts that only saw retired visual notices',()=>{
  assert.equal(hasSeenLatestRelease(LATEST_RELEASE_ID),true);
  for(const id of ['2026-10-12-v040','2026-10-12-v041','2026-10-13-v042']) assert.equal(hasSeenLatestRelease(id),false);
  assert.equal(hasSeenLatestRelease(null),false);
  assert.equal(hasSeenLatestRelease('unknown-release'),false);
});
