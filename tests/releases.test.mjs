import test from 'node:test';
import assert from 'node:assert/strict';
import {RELEASES,LATEST_RELEASE_ID, hasSeenLatestRelease} from '../web/src/releases.js';

test('creator announcement updates copy without repeating the release notification',()=>{
  const latest=RELEASES[0];
  assert.equal(latest.id,'2026-10-20-community');
  assert.equal(hasSeenLatestRelease('2026-10-20-community'),true);
  assert.match(latest.title,/I'm making DuskTranslate free/);
  assert.ok(latest.paragraphs.length>0);
  assert.match(latest.paragraphs.join(' '),/payment link isn't ready/);
  assert.match(latest.paragraphs.join(' '),/provider may charge/);
  assert.match(latest.items.join(' '),/Portuguese/);
});

test('the latest feature is announced to accounts that only saw retired visual notices',()=>{
  assert.equal(hasSeenLatestRelease(LATEST_RELEASE_ID),true);
  for(const id of ['2026-10-12-v040','2026-10-12-v041','2026-10-13-v042']) assert.equal(hasSeenLatestRelease(id),false);
  assert.equal(hasSeenLatestRelease(null),false);
  assert.equal(hasSeenLatestRelease('unknown-release'),false);
});
