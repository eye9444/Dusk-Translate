import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCommentAnchor, locateCommentAnchor } from '../web/src/comment-anchors.js';
test('comment quotes follow surrounding edits and fail closed on ambiguity or deletion', () => {
  const anchor = makeCommentAnchor('one', 'translation', 'Hello world!', 6, 11);
  assert.deepEqual(locateCommentAnchor(anchor, 'Dear Hello world!'), { start: 11, end: 16 });
  assert.equal(locateCommentAnchor(anchor, 'Hello friend!'), null);
  assert.equal(locateCommentAnchor(anchor, 'world / world'), null);
  assert.throws(() => makeCommentAnchor('one','translation','short',0,2001));
});
