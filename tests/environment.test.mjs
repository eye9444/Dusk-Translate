import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentLabel } from '../web/src/environment.js';

test('production builds do not display an environment warning', () => {
  assert.equal(deploymentLabel('production', '0.9.1', 'abcdef123'), '');
});

test('staging and preview builds identify their version and commit', () => {
  assert.equal(deploymentLabel('staging', '0.9.1', 'abcdef123'), 'Staging / v0.9.1 / abcdef1');
  assert.equal(deploymentLabel('preview', '0.9.1', '123456789'), 'Preview / v0.9.1 / 1234567');
});
