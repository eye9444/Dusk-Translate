import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replacementByteLimit, validateReplacementMetadata } from '../web/src/image-policy.js';

test('replacement allowance uses original bytes and respects storage ceiling', () => {
  const mb = 1024 * 1024;
  assert.equal(replacementByteLimit(15 * mb), 25 * mb);
  assert.equal(replacementByteLimit(45 * mb), 50 * mb);
  const image = { originalBytes: 15 * mb, bytes: 25 * mb, width: 2000, height: 3000, mime: 'image/png' };
  assert.doesNotThrow(() => validateReplacementMetadata(image));
  assert.throws(() => validateReplacementMetadata({ ...image, bytes: image.bytes + 1 }));
  assert.throws(() => validateReplacementMetadata({ ...image, width: 8000, height: 8000 }));
  assert.throws(() => validateReplacementMetadata({ ...image, mime: 'image/svg+xml' }));
  assert.throws(() => validateReplacementMetadata({ ...image, animated: true }));
});
