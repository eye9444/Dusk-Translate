import { createClient } from '@supabase/supabase-js';
import { cleanSnapshot } from './model.js';
import { createAuthStorage } from './auth-storage.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const authStorage=createAuthStorage(localStorage,sessionStorage);
if(url)authStorage.setPrefix(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`);
export const cloud = url && key ? createClient(url, key, {
  auth: { flowType:'pkce', detectSessionInUrl:true, persistSession:true, autoRefreshToken:true, storage:authStorage }
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
    const request = indexedDB.open('dusktranslate-library', 4);
    request.onupgradeneeded = event => {
      const database = request.result;
      if (event.oldVersion < 3) database.createObjectStore('projectComments', { keyPath: 'cacheKey' });
      if (event.oldVersion < 4) {
        const updates = database.createObjectStore('documentUpdates', { keyPath:'operationId' });
        updates.createIndex('projectId', 'projectId');
      }
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
  async documentUpdates(projectId) { return transaction('documentUpdates','readonly',({documentUpdates})=>documentUpdates.index('projectId').getAll(projectId)); },
  queueDocumentUpdate(projectId,operationId,payload) { return transaction('documentUpdates','readwrite',({documentUpdates})=>documentUpdates.put({projectId,operationId,payload,createdAt:new Date().toISOString()})); },
  removeDocumentUpdate(operationId) { return transaction('documentUpdates','readwrite',({documentUpdates})=>documentUpdates.delete(operationId)); },
  async comments(owner, id) { return (await transaction('projectComments', 'readonly', ({projectComments}) => projectComments.get(`${owner}:${id}`)))?.threads || []; },
  saveComments(owner, id, threads) { return transaction('projectComments', 'readwrite', ({projectComments}) => projectComments.put({cacheKey:`${owner}:${id}`, threads})); },
  async list(owner) { return (await transaction('projects', 'readonly', ({projects}) => projects.getAll())).filter(p => p.owner === owner); },
  async get(owner, id) {
    const cacheKey = `${owner}:${id}`;
    const project = await transaction('projects', 'readonly', ({projects}) => projects.get(cacheKey));
    if (!project) return project;
    const file = await transaction('projectFiles', 'readonly', ({projectFiles}) => projectFiles.get(cacheKey));
    return { ...project, file: file?.file };
  },
  put(p) { return transaction(['projects','projectFiles'], 'readwrite', ({projects,projectFiles}) => {
    const cacheOwner = p.cacheOwner || p.owner;
    const record = { ...p, cacheOwner, cacheKey: `${cacheOwner}:${p.id}`, snapshot: cleanSnapshot(p.snapshot) };
    const file = record.file;
    delete record.file;
    projects.put(record);
    if (file) projectFiles.put({ cacheKey: record.cacheKey, file });
  }); },
  patch(p) { return transaction('projects', 'readwrite', ({projects}) => {
    const cacheOwner = p.cacheOwner || p.owner;
    const record = { ...p, cacheOwner, cacheKey: `${cacheOwner}:${p.id}`, snapshot: cleanSnapshot(p.snapshot) };
    delete record.file;
    projects.put(record);
  }); },
  remove(owner, id) { const cacheKey = `${owner}:${id}`; return transaction(['projects','projectFiles','projectComments'], 'readwrite', ({projects,projectFiles,projectComments}) => { projects.delete(cacheKey); projectFiles.delete(cacheKey); projectComments.delete(cacheKey); }); }
};
function must(result) {
  if (result.error) {
    if (result.error.code === 'PGRST205') throw new Error('Your account is connected, but cloud project storage still needs setup by the project owner. Sign out to use your browser library for now.');
    if (result.error.code === 'PGRST202') throw new Error('Project sharing still needs its Supabase migration. Ask the project owner to run the latest migration before inviting collaborators.');
    throw new Error(result.error.message);
  }
  return result.data;
}
function fromRow(row) {
  return { id:row.id, owner:row.owner_id, title:row.title, fileName:row.file_name, filePath:row.file_path, snapshot:row.snapshot, archived:row.archived, updatedAt:row.updated_at, createdAt:row.created_at, revision:row.revision, collaborators:row.project_collaborators || [], dirty:false };
}
export const remote = {
  async imageAssets(projectId){return must(await cloud.from('project_image_assets').select('*').eq('project_id',projectId));},
  async registerImage(projectId,id,path,bytes,mime){return must(await cloud.rpc('register_project_image',{target_project_id:projectId,image_id:id,image_epub_path:path,image_original_bytes:bytes,image_original_mime:mime}));},
  async uploadImage(path,file){must(await cloud.storage.from('books').upload(path,file,{contentType:file.type,upsert:true}));},
  async setImageReplacement(projectId,id,path,metadata){return must(await cloud.rpc('set_project_image_replacement',{target_project_id:projectId,image_id:id,object_name:path,image_bytes:metadata.bytes,image_mime:metadata.mime,image_width:metadata.width,image_height:metadata.height}));},
  async clearImageReplacement(projectId,id){return must(await cloud.rpc('clear_project_image_replacement',{target_project_id:projectId,image_id:id}));},
  async downloadImage(path){return must(await cloud.storage.from('books').download(path));},
  async deleteImage(path){if(path)must(await cloud.storage.from('books').remove([path]));},
  async initializeDocument(projectId, seed) {
    return postgresToBytes(must(await cloud.rpc('initialize_project_document',{target_project_id:projectId,initial_state:bytesToPostgres(seed)})));
  },
  async documentUpdates(projectId, since = null) {
    let query=cloud.from('project_document_updates').select('update_id,payload,created_at').eq('project_id',projectId).order('created_at',{ascending:true}).order('update_id',{ascending:true});
    if(since)query=query.gte('created_at',since);
    return must(await query).map(row=>({operationId:row.update_id,payload:postgresToBytes(row.payload),createdAt:row.created_at}));
  },
  async appendDocumentUpdate(projectId, operationId, payload) {
    must(await cloud.rpc('append_project_document_update',{target_project_id:projectId,operation_id:operationId,update_bytes:bytesToPostgres(payload)}));
  },
  async list() { return must(await cloud.from('projects').select('id,owner_id,title,file_name,file_path,archived,updated_at,created_at,revision,project_collaborators(user_id,role)').order('updated_at', { ascending:false })).map(fromRow); },
  async create(p) {
    const path = `${p.owner}/${p.id}/original`;
    must(await cloud.storage.from('books').upload(path,p.file,{contentType:'application/octet-stream'}));
    const result = await cloud.from('projects').insert({id:p.id,owner_id:p.owner,title:p.title,file_name:p.fileName,file_path:path,snapshot:cleanSnapshot(p.snapshot)}).select('id,owner_id,title,file_name,file_path,snapshot,archived,updated_at,created_at,revision,project_collaborators(user_id,role)').single();
    if (result.error) { await cloud.storage.from('books').remove([path]); must(result); }
    return { ...fromRow(result.data), file:p.file };
  },
  async open(id) {
    const row = must(await cloud.from('projects').select('id,owner_id,title,file_name,file_path,snapshot,archived,updated_at,created_at,revision,project_collaborators(user_id,role)').eq('id',id).single());
    const file = must(await cloud.storage.from('books').download(row.file_path));
    return { ...fromRow(row), file };
  },
  async save(p) {
    const rows = must(await cloud.from('projects').update({ title:p.title, snapshot:cleanSnapshot(p.snapshot), archived:p.archived }).eq('id',p.id).eq('revision',p.revision).select('id,owner_id,title,file_name,file_path,snapshot,archived,updated_at,created_at,revision,project_collaborators(user_id,role)'));
    if (!rows.length) throw new Error('This project changed in another tab or device. Your draft is saved on this device; download a backup before reopening.');
    return fromRow(rows[0]);
  },
  async remove(p) {
    // Remove the object first. A failed object deletion leaves a retryable record.
    must(await cloud.storage.from('books').remove([p.filePath]));
    const rows = must(await cloud.from('projects').delete().eq('id',p.id).select('id'));
    if (!rows.length) throw new Error('Project could not be deleted. Refresh your library.');
  },
  async collaborators(projectId) {
    return must(await cloud.rpc('list_project_collaborators', { target_project_id:projectId }));
  },
  async share(projectId, email) {
    return must(await cloud.rpc('share_project', { target_project_id:projectId, collaborator_email:email, collaborator_role:'editor' }));
  },
  async removeCollaborator(projectId, userId) {
    must(await cloud.rpc('remove_project_collaborator', { target_project_id:projectId, target_user_id:userId }));
  },
  async invitations(projectId) {
    return must(await cloud.rpc('list_project_invitations', { target_project_id:projectId }));
  },
  async invite(projectId, invitees) {
    return must(await cloud.rpc('create_project_invitations', { target_project_id:projectId, invitees }));
  },
  async revokeInvitation(invitationId) {
    must(await cloud.rpc('revoke_project_invitation', { target_invitation_id:invitationId }));
  },
  async changeCollaboratorRole(projectId, userId, role) {
    must(await cloud.rpc('update_project_collaborator_role', { target_project_id:projectId, target_user_id:userId, new_role:role }));
  },
  async inbox() {
    return must(await cloud.rpc('list_my_project_invitations'));
  },
  async respondToInvitation(invitationId, accept) {
    return must(await cloud.rpc('respond_to_project_invitation', { target_invitation_id:invitationId, accept_invitation:accept }));
  },
  async publicReaderLink(projectId) {
    const links=must(await cloud.rpc('get_public_reader_link', { target_project_id:projectId }));
    return links[0]?.token || null;
  },
  async enablePublicReaderLink(projectId) {
    const links=must(await cloud.rpc('enable_public_reader_link', { target_project_id:projectId }));
    return links[0]?.token;
  },
  async disablePublicReaderLink(projectId) {
    must(await cloud.rpc('disable_public_reader_link', { target_project_id:projectId }));
  },
  async openPublicReader(token) {
    if (!url || !key) throw new Error('Public reader links are not configured.');
    const shared=createClient(url,key,{ auth:{ persistSession:false, autoRefreshToken:false }, global:{ headers:{ 'x-dusk-share-token':token } } });
    const rows=must(await shared.rpc('open_public_reader_link', { reader_token:token }));
    if (!rows.length) throw new Error('This reader link is invalid or has been disabled.');
    const row=rows[0], file=must(await shared.storage.from('books').download(row.file_path));
    return { id:row.project_id, owner:'shared', title:row.title, fileName:row.file_name, filePath:row.file_path, snapshot:row.snapshot, file, archived:false, collaborators:[], dirty:false };
  }
};

function bytesToPostgres(bytes) {
  return `\\x${[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('')}`;
}
function postgresToBytes(value) {
  if(typeof value!=='string'||!/^\\x[0-9a-f]*$/i.test(value))throw new Error('Invalid collaborative update payload.');
  const hex=value.slice(2),bytes=new Uint8Array(hex.length/2);
  for(let index=0;index<bytes.length;index++)bytes[index]=Number.parseInt(hex.slice(index*2,index*2+2),16);
  return bytes;
}
