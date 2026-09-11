import { createClient } from '@supabase/supabase-js';
import { cleanSnapshot } from './model.js';
import { createAuthStorage } from './auth-storage.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const authStorage=createAuthStorage(localStorage,sessionStorage);
if(url)authStorage.setPrefix(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`);
export const cloud = url && key ? createClient(url, key, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, storage:authStorage }
}) : null;
export async function googleAvailable() {
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey:key }, signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Could not check Google sign-in. Please try again.');
  const settings = await response.json();
  if (typeof settings.external?.google !== 'boolean') throw new Error('Could not check Google sign-in. Please try again.');
  return settings.external.google;
}
let database;
function db() {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('dusktranslate-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'cacheKey' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser storage is unavailable. Enable site storage to save projects.'));
  });
}
async function transaction(mode, work) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('projects', mode);
    const request = work(tx.objectStore('projects'));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error || new Error('Could not save project. Your browser storage may be full.'));
    tx.onabort = () => reject(tx.error || new Error('Project storage was interrupted.'));
  });
}
export const local = {
  async list(owner) { return (await transaction('readonly', s => s.getAll())).filter(p => p.owner === owner); },
  get(owner, id) { return transaction('readonly', s => s.get(`${owner}:${id}`)); },
  put(p) { return transaction('readwrite', s => s.put({ ...p, cacheKey: `${p.owner}:${p.id}`, snapshot: cleanSnapshot(p.snapshot) })); },
  remove(owner, id) { return transaction('readwrite', s => s.delete(`${owner}:${id}`)); }
};
function must(result) {
  if (result.error) throw new Error(result.error.code === 'PGRST205'
    ? 'Your account is connected, but cloud project storage still needs setup by the project owner. Sign out to use your browser library for now.'
    : result.error.message);
  return result.data;
}
function fromRow(row) {
  return { id:row.id, owner:row.owner_id, title:row.title, fileName:row.file_name, filePath:row.file_path, snapshot:row.snapshot, archived:row.archived, updatedAt:row.updated_at, createdAt:row.created_at, revision:row.revision, dirty:false };
}
export const remote = {
  async list() { return must(await cloud.from('projects').select('id,owner_id,title,file_name,file_path,archived,updated_at,created_at,revision').order('updated_at', { ascending:false })).map(fromRow); },
  async create(p) {
    // Check the project schema before uploading a book to an unconfigured backend.
    must(await cloud.from('projects').select('id').limit(0));
    const path = `${p.owner}/${p.id}/original`;
    must(await cloud.storage.from('books').upload(path,p.file,{contentType:'application/octet-stream'}));
    const result = await cloud.from('projects').insert({id:p.id,owner_id:p.owner,title:p.title,file_name:p.fileName,file_path:path,snapshot:cleanSnapshot(p.snapshot)}).select().single();
    if (result.error) { await cloud.storage.from('books').remove([path]); must(result); }
    return { ...fromRow(result.data), file:p.file };
  },
  async open(id) {
    const row = must(await cloud.from('projects').select('*').eq('id',id).single());
    const file = must(await cloud.storage.from('books').download(row.file_path));
    return { ...fromRow(row), file };
  },
  async save(p) {
    const rows = must(await cloud.from('projects').update({ title:p.title, snapshot:cleanSnapshot(p.snapshot), archived:p.archived }).eq('id',p.id).eq('revision',p.revision).select());
    if (!rows.length) throw new Error('This project changed in another tab or device. Your draft is saved on this device; download a backup before reopening.');
    return fromRow(rows[0]);
  },
  async remove(p) {
    // Remove the object first. A failed object deletion leaves a retryable record.
    must(await cloud.storage.from('books').remove([p.filePath]));
    const rows = must(await cloud.from('projects').delete().eq('id',p.id).select('id'));
    if (!rows.length) throw new Error('Project could not be deleted. Refresh your library.');
  }
};
