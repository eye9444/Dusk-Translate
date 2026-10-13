import test from 'node:test';
import assert from 'node:assert/strict';
import {LATEST_RELEASE_ID, hasSeenLatestRelease} from '../web/src/releases.js';

test('retired visual notices preserve feature acknowledgements',()=>{
  for(const id of [LATEST_RELEASE_ID,'2026-10-12-v040','2026-10-12-v041','2026-10-13-v042']) {
    assert.equal(hasSeenLatestRelease(id),true);
  }
  assert.equal(hasSeenLatestRelease(null),false);
  assert.equal(hasSeenLatestRelease('unknown-release'),false);
});
