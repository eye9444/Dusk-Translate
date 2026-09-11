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
// IndexedDB keeps metadata and large original files in separate stores. This
// prevents every autosave from rewriting the user's unchanged EPUB blob.
let database;
function db() {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('dusktranslate-library', 2);
    request.onupgradeneeded = event => {
      const database = request.result;
      const projects = event.oldVersion < 1
        ? database.createObjectStore('projects', { keyPath: 'cacheKey' })
        : request.transaction.objectStore('projects');
      if (event.oldVersion < 2) {
        const files = database.createObjectStore('projectFiles', { keyPath: 'cacheKey' });
        if (event.oldVersion >= 1) {
          projects.openCursor().onsuccess = cursorEvent => {
            const cursor = cursorEvent.target.result;
            if (!cursor) return;
            const record = cursor.value;
            if (record.file) {
              files.put({ cacheKey: record.cacheKey, file: record.file });
              delete record.file;
              cursor.update(record);
            }
            cursor.continue();
          };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser storage is unavailable. Enable site storage to save projects.'));
  });
}
async function transaction(storeNames, mode, work) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = database.transaction(names, mode);
    const stores = Object.fromEntries(names.map(name => [name, tx.objectStore(name)]));
    const request = work(stores, tx);
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error || new Error('Could not save project. Your browser storage may be full.'));
    tx.onabort = () => reject(tx.error || new Error('Project storage was interrupted.'));
  });
}
export const local = {
  async list(owner) { return (await transaction('projects', 'readonly', ({projects}) => projects.getAll())).filter(p => p.owner === owner); },
  async get(owner, id) {
    const cacheKey = `${owner}:${id}`;
    const project = await transaction('projects', 'readonly', ({projects}) => projects.get(cacheKey));
    if (!project) return project;
    const file = await transaction('projectFiles', 'readonly', ({projectFiles}) => projectFiles.get(cacheKey));
    return { ...project, file: file?.file };
  },
  put(p) { return transaction(['projects','projectFiles'], 'readwrite', ({projects,projectFiles}) => {
    const record = { ...p, cacheKey: `${p.owner}:${p.id}`, snapshot: cleanSnapshot(p.snapshot) };
    const file = record.file;
    delete record.file;
    projects.put(record);
    if (file) projectFiles.put({ cacheKey: record.cacheKey, file });
  }); },
  patch(p) { return transaction('projects', 'readwrite', ({projects}) => {
    const record = { ...p, cacheKey: `${p.owner}:${p.id}`, snapshot: cleanSnapshot(p.snapshot) };
    delete record.file;
    projects.put(record);
  }); },
  remove(owner, id) { const cacheKey = `${owner}:${id}`; return transaction(['projects','projectFiles'], 'readwrite', ({projects,projectFiles}) => { projects.delete(cacheKey); projectFiles.delete(cacheKey); }); }
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
    const path = `${p.owner}/${p.id}/original`;
    must(await cloud.storage.from('books').upload(path,p.file,{contentType:'application/octet-stream'}));
    const result = await cloud.from('projects').insert({id:p.id,owner_id:p.owner,title:p.title,file_name:p.fileName,file_path:path,snapshot:cleanSnapshot(p.snapshot)}).select('id,owner_id,title,file_name,file_path,snapshot,archived,updated_at,created_at,revision').single();
    if (result.error) { await cloud.storage.from('books').remove([path]); must(result); }
    return { ...fromRow(result.data), file:p.file };
  },
  async open(id) {
    const row = must(await cloud.from('projects').select('id,owner_id,title,file_name,file_path,snapshot,archived,updated_at,created_at,revision').eq('id',id).single());
    const file = must(await cloud.storage.from('books').download(row.file_path));
    return { ...fromRow(row), file };
  },
  async save(p) {
    const rows = must(await cloud.from('projects').update({ title:p.title, snapshot:cleanSnapshot(p.snapshot), archived:p.archived }).eq('id',p.id).eq('revision',p.revision).select('id,owner_id,title,file_name,file_path,snapshot,archived,updated_at,created_at,revision'));
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
