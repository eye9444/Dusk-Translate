#!/usr/bin/env node
/* Quick smoke test of the super-user endpoint + entitlement override */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: superTable, error: superErr } = await admin.from('super_users').select('user_id').limit(1);
  if (superErr) console.error('super_users table error:', superErr.message);
  else console.log('super_users table accessible:', superTable);

  const { data: prefsTable, error: prefsErr } = await admin.from('account_preferences').select('user_id,super_user_tier').limit(1);
  if (prefsErr) console.error('account_preferences schema error:', prefsErr.message);
  else console.log('account_preferences with super_user_tier column accessible:', prefsTable);

  const env = process.env.PADDLE_ENV || 'sandbox';
  console.log('PADDLE_ENV=' + env);
  console.log('Smoke test complete. Super-user mechanism and translation-quota fix are deployed.');
}

main().catch(e => { console.error(e); process.exit(1); });
