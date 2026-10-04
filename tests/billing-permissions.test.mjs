import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { launchDatabase } from './helpers/launch-db.mjs';

test('server-verified actor operations cannot be called directly by API roles',async()=>{
  const db=await launchDatabase();
  try{
    const {rows}=await db.query(`select proname,
      has_function_privilege('anon',oid,'execute') as guest,
      has_function_privilege('authenticated',oid,'execute') as browser
      from pg_proc where proname in ('translation_quota','translation_quota_accounting',
      'bind_paddle_checkout','reconcile_sandbox_customer','initialize_checked_document',
      'append_checked_document','initialize_project_document','append_project_document_update')`);
    assert.equal(rows.length,8);
    for(const row of rows){assert.equal(row.guest,false,row.proname);assert.equal(row.browser,false,row.proname);}
  }finally{await db.close();}
});

test('billing RPC hardening removes explicit browser grants and preserves server execution', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(await readFile('supabase/migrations/202610020003_paddle_billing.sql', 'utf8'));
    await db.exec('grant execute on all functions in schema public to anon,authenticated;');
    await db.exec(await readFile('supabase/migrations/202610040002_billing_rpc_permissions.sql', 'utf8'));
    const { rows } = await db.query(`select
      has_function_privilege('anon',oid,'execute') as guest,
      has_function_privilege('authenticated',oid,'execute') as browser,
      has_function_privilege('service_role',oid,'execute') as server
      from pg_proc where proname like 'upsert_paddle_%'`);
    assert.equal(rows.length, 3);
    for (const row of rows) assert.deepEqual(row, { guest: false, browser: false, server: true });
  } finally { await db.close(); }
});
