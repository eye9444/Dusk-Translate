import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-staging.yml', import.meta.url), 'utf8');
const store = await readFile(new URL('../web/src/store.js', import.meta.url), 'utf8');

test('hosted staging is explicitly local-only and has no database deployment steps', () => {
  assert.match(workflow, /VITE_LOCAL_ONLY: "true"/);
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL|STAGING_SUPABASE|db push|seed-staging/);
  assert.match(store, /localOnly \? '' : import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(store, /localOnly \? '' : import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/);
});
