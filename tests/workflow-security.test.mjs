import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/202610110003_team_workflow.sql',import.meta.url),'utf8');
const leadMigration=await readFile(new URL('../supabase/migrations/202610120001_single_workflow_lead.sql',import.meta.url),'utf8');
test('workflow RPCs enforce roles and do not inherit anonymous execute',()=>{
  assert.match(migration,/public\.launch_tier\(actor\)<>'advanced'/);
  assert.match(migration,/Only the current review stage can return this chapter/);
  assert.match(migration,/A return note is required/);
  assert.match(migration,/from public,anon,authenticated/);
  assert.match(migration,/published_revision/);
});
test('appointing a Lead demotes stale Lead rows without exposing the RPC anonymously',()=>{
  assert.match(leadMigration,/workflow_role='translator'.+workflow_role='lead'.+user_id<>/s);
  assert.match(leadMigration,/Appoint another Lead before changing this role/);
  assert.match(leadMigration,/from public,anon,authenticated/);
  assert.match(leadMigration,/to authenticated/);
});
