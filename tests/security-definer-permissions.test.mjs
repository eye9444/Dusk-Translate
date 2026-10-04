import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/202610050002_security_definer_allowlist.sql', import.meta.url), 'utf8');

test('security definer functions default closed with explicit browser allowlists', () => {
  assert.match(migration, /where n\.nspname = 'public' and p\.prosecdef/);
  assert.match(migration, /revoke execute on function %s from public, anon, authenticated/);
  assert.match(migration, /open_public_reader_link\(uuid\)[\s\S]*to anon, authenticated/);
  assert.match(migration, /write_reader_comment\(uuid,text,text,uuid,text,text,text\)[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /translation_quota\([^;]+to authenticated/);
  assert.doesNotMatch(migration, /append_checked_document\([^;]+to authenticated/);
});
