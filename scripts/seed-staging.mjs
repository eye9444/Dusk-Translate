import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.STAGING_SUPABASE_URL;
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.STAGING_FIXTURE_EMAIL;
const password = process.env.STAGING_FIXTURE_PASSWORD;
assert.equal(process.env.ALLOW_STAGING_SEED, 'DUSK_STAGING_ONLY', 'Staging seed confirmation is missing.');
assert.ok(url && serviceKey && email && password, 'Staging Supabase and fixture account variables are required.');
assert.notEqual(url, process.env.PRODUCTION_SUPABASE_URL, 'Refusing to seed the production Supabase project.');

const supabase = createClient(url, serviceKey, { auth:{ persistSession:false, autoRefreshToken:false } });
let user;
for (let page = 1; !user; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage:100 });
  if (error) throw error;
  user = data.users.find(candidate => candidate.email === email);
  if (data.users.length < 100) break;
}
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm:true });
  if (error) throw error;
  user = data.user;
} else {
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm:true });
  if (error) throw error;
}

const projectId = '00000000-0000-4000-8000-000000000901';
const filePath = `${user.id}/${projectId}/original`;
const snapshot = {
  novel:{ title:'Staging fixture novel', chapters:[{ id:'fixture-1', title:'Synthetic chapter', text:'これはステージング環境専用のテスト文章です。' }] },
  translations:{ 'fixture-1':'This is synthetic text used only in the staging environment.' },
  completed:['fixture-1'], cur:0, glossary:'', sourceLanguage:'ja', targetLanguage:'en', style:'natural'
};
const { error: uploadError } = await supabase.storage.from('books').upload(filePath, new Blob(['Synthetic staging fixture.']), { contentType:'text/plain', upsert:true });
if (uploadError) throw uploadError;
const { error: projectError } = await supabase.from('projects').upsert({ id:projectId, owner_id:user.id, title:'Staging fixture novel', file_name:'staging-fixture.txt', file_path:filePath, snapshot, archived:false }, { onConflict:'id' });
if (projectError) throw projectError;
const { error: readerError } = await supabase.from('project_reader_links').upsert({ project_id:projectId, created_by:user.id }, { onConflict:'project_id' });
if (readerError) throw readerError;
console.log('Staging fixtures are ready: test account, translated project, source file, and reader link.');
