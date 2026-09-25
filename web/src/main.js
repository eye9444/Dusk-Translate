import './style.css';
import './glass.css';
import './welcome.css';
import './reader.css';
import { cloud, local, remote, googleAvailable, authStorage } from './store.js';
import { validateFile, cleanSnapshot, progress } from './model.js';
import { buildTranslatedEpub, readEpub } from './epub-reader.js';
import { startProjectPresence } from './presence.js';

const $ = id => document.getElementById(id);
const authReturn = new URL(location.href);
const authParams = new URLSearchParams(authReturn.hash.slice(1));
authReturn.searchParams.forEach((value,key)=>authParams.set(key,value));
const isAuthReturn = ['code','error','error_description','error_code','access_token'].some(key=>authParams.has(key));
let authBusy = false;
let user = null, projects = [], invitations = [], active = null, working = false;
let generation = 0, persisted = 0, saveTask = null, saveTimer = null, saveError = '', streaming = false;
let authMode = 'signin', manage = null, releaseLock = null;
let editorReady = false, closing = false, opening = false, libraryRequest = 0;
let projectPresence = null;
let readerOpen = false, readerProject = null, readerBook = null, readerChapter = 0, readerReturn = 'library';
let renderedOwner = null;
let libraryView = 'projects';
let guestMode=sessionStorage.getItem('dusk-guest')==='true';
const READER_FONT_KEY = 'dusk-reader-font-size';
const READER_FONT_DEFAULT = 20, READER_FONT_STEP = 2, READER_FONT_MIN = 14, READER_FONT_MAX = 32;
const ROUTES = new Set(['/','/home','/editor','/reader']);
const owner = () => user?.id || 'guest';
const isCloud = () => active && active.owner !== 'guest';
const isEpub = project => /\.epub$/i.test(project?.fileName || '');
function currentRoute() { const path = location.pathname.replace(/\/+$/, '') || '/'; return ROUTES.has(path) ? path : '/'; }
function projectRoute(path, id, edition = '') {
  const query = new URLSearchParams({ project:id });
  if (edition) query.set('edition', edition);
  return `${path}?${query}`;
}
function navigate(path, replace = false) {
  if (`${location.pathname}${location.search}` === path) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
}
// Match the production redirect when running with the local development server.
if (currentRoute() === '/editor') location.replace('/home');
function status(message) { $('library-status').textContent = message; }
function errorMessage(error) { return error?.message || 'Something went wrong. Please try again.'; }
function announceSave(message) {
  $('save-status').textContent = message;
  if (active) $('editor').contentWindow?.postMessage({type:'host:status',message}, location.origin);
}
function openActiveEditorProject() {
  if (!active) return;
  $('editor').contentWindow?.postMessage({type:'host:open',project:active}, location.origin);
  theme(localStorage.getItem('theme') || 'dusk');
  announceSave('Opening...');
}
function el(tag, className, value) { const n = document.createElement(tag); n.className = className; if (value !== undefined) n.textContent = value; return n; }
function button(label, action) { const n = el('button','',label); n.addEventListener('click', action); return n; }
function download(name, data) { const url = URL.createObjectURL(data); const a = el('a',''); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
function safeFileName(value) { return String(value || 'project').replace(/[^a-z0-9_-]/gi,'_'); }
function textExport(snapshot) {
  const excluded = new Set(snapshot?.exportExcluded || []);
  return (snapshot?.novel?.chapters || []).flatMap(chapter => {
    if (excluded.has(chapter.id)) return [];
    const translation = snapshot.translations?.[chapter.id]?.replace(/…PARTIAL$/, '').trim();
    return translation ? [`${'─'.repeat(60)}\n[${chapter.id}]\n${'─'.repeat(60)}\n\n${translation}`] : [];
  }).join('\n\n');
}
function showExportSettings() {
  if (!active?.snapshot?.novel) return;
  const excluded = new Set(active.snapshot.exportExcluded || []);
  $('export-chapters').replaceChildren(...active.snapshot.novel.chapters.map((chapter, index) => {
    const label = el('label', 'export-chapter'), input = document.createElement('input');
    input.type = 'checkbox'; input.value = chapter.id; input.checked = !excluded.has(chapter.id);
    label.append(input, el('span', '', `Chapter ${index + 1} · ${chapter.id}`), el('small', '', chapter.text.replace(/\s+/g, ' ').slice(0, 72)));
    return label;
  }));
  $('export-settings-dialog').showModal();
}
$('export-settings-form').onsubmit = event => {
  event.preventDefault(); if (!active) return;
  const included = new Set([...$('export-chapters').querySelectorAll('input:checked')].map(input => input.value));
  const exportExcluded = active.snapshot.novel.chapters.filter(chapter => !included.has(chapter.id)).map(chapter => chapter.id);
  $('editor').contentWindow.postMessage({ type:'host:exportSettings', exportExcluded }, location.origin);
  $('export-settings-dialog').close();
};
function theme(value) { document.body.classList.toggle('eclipse', value === 'eclipse'); localStorage.setItem('theme',value); $('editor').contentWindow?.postMessage({type:'host:theme',theme:value}, location.origin); }
theme(localStorage.getItem('theme') || 'dusk');
$('theme').onclick = () => theme(document.body.classList.contains('eclipse') ? 'dusk' : 'eclipse');
document.querySelectorAll('[data-close]').forEach(n => n.onclick = () => n.closest('dialog').close());

async function refresh() {
  if (currentRoute() === '/' && (user || guestMode)) navigate('/home', true);
  const request = ++libraryRequest;
  const libraryOwner = owner();
  let cached = [];
  $('welcome').hidden=Boolean(user)||guestMode;
  $('library').hidden=Boolean(active)||(!user&&!guestMode);
  if(renderedOwner!==libraryOwner){projects=[];renderedOwner=libraryOwner;render();}
  $('storage-label').textContent = user ? 'YOUR CLOUD LIBRARY' : 'THIS BROWSER';
  $('account').textContent = user ? 'Sign out' : 'Sign in';
  $('storage-caption').textContent=user?'Your personal cloud library':'A library on this device';
  $('nav-inbox').hidden=!user;
  if (!user && libraryView === 'inbox') libraryView='projects';
  $('storage-info').textContent = user ? `Signed in as ${user.email}. Cloud books and progress are private to your account. Local projects stay in your browser library.` : 'Saved in this browser, including the original EPUB. Clearing site data removes local projects. Sign in for a cloud library.';
  if(user)status('Refreshing your account library...');
  try {
    cached=await local.list(libraryOwner);
    const result=user?await remote.list():cached;
    const pendingInvitations=user?await remote.inbox().catch(()=>[]):[];
    if(request !== libraryRequest || libraryOwner !== owner()) return;
    projects=user?result.map(p=>{
      const draft=cached.find(c=>c.id===p.id);
      return draft?.dirty?draft:draft?.revision===p.revision?{...p,snapshot:draft.snapshot}:p;
    }):result;
    invitations=pendingInvitations;
    status('');render();
  }catch(e){
    if(request !== libraryRequest || libraryOwner !== owner())return;
    projects=cached;
    render();status(`${errorMessage(e)}${projects.length?' Showing projects cached on this device.':''}`);
  }
}
function render() {
  const inboxView = libraryView === 'inbox';
  const archived=$('filter').value==='archived',query=$('search').value.trim().toLowerCase();
  const sorted=[...projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const view = sorted.filter(p => p.archived === archived && p.title.toLowerCase().includes(query));
  $('active-count').textContent=String(projects.filter(p=>!p.archived).length);
  $('archive-count').textContent=String(projects.filter(p=>p.archived).length);
  $('invite-count').textContent=String(invitations.length);
  $('collection-title').textContent=inboxView?'Project invitations':archived?'Archived projects':'Active translation projects';
  $('collection-name').textContent=inboxView?'Invites':archived?'Archive':'My library';
  ['active','archived','inbox'].forEach(value=>{
    const nav=$('nav-'+value);
    if((value === 'inbox' && inboxView) || (value !== 'inbox' && !inboxView && value === $('filter').value)) nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');
  });
  document.querySelector('.filters').hidden=inboxView;
  if (inboxView) { renderInvitationInbox(); return; }
  const recent=sorted.find(p=>!p.archived);
  $('resume-strip').hidden=!recent||archived||!!query;
  if(recent){
    $('resume-title').textContent=recent.title;
    $('resume-detail').textContent=`Last edited ${new Date(recent.updatedAt).toLocaleDateString()} · ${recent.fileName.split('.').pop().toUpperCase()}`;
    $('resume-project').onclick=()=>openProject(recent.id);
  }
  $('count').textContent = String(view.length); $('projects').replaceChildren();
  if (!view.length) {
    const box=el('div','empty'),mark=el('span','empty-mark',query?'?':'01');mark.setAttribute('aria-hidden','true');
    box.append(mark,el('h3','',query?'No projects match that title.':archived?'No archived projects.':'No translation projects yet.'),el('p','',query?'Try a different title, or clear your search.':archived?'Projects you archive will appear here.':'Upload an EPUB, TXT, or JSON file to start translating.'));
    if(query)box.append(button('Clear search',()=>{$('search').value='';render();$('search').focus();}));
    else if(archived)box.append(button('Back to my library',()=>setCollection('active')));
    else {box.append(button('Start translating',()=>$('new-project').click()),el('small','','EPUB / TXT / JSON / BACKUP ZIP'));}
    $('projects').append(box);
  }
  view.forEach(p => {
    const card = el('article','project-card');
    const details = progress(p.snapshot);
    const role=p.owner===user?.id?'owner':p.collaborators?.find(member=>member.user_id===user?.id)?.role;
    const projectLocation = p.owner === 'guest' ? 'ON THIS DEVICE' : p.owner === user?.id ? 'CLOUD' : `SHARED WITH YOU / ${String(role || 'viewer').toUpperCase()}`;
    card.append(el('p',p.owner === user?.id ? 'stamp' : 'stamp shared-stamp',`${p.fileName.split('.').pop().toUpperCase()} / ${projectLocation}`),el('h3','',p.title));
    card.append(el('p','muted',p.snapshot ? `${details.done} of ${details.total} chapters complete` : 'Open to continue your translation'));
    if (p.snapshot) { const bar = document.createElement('progress'); bar.max=100; bar.value=details.percent; bar.setAttribute('aria-label',`${details.percent}% translated`); card.append(bar); }
    card.append(el('p','stamp',p.dirty?'Saved on device / cloud sync pending':`Saved ${new Date(p.updatedAt).toLocaleDateString()}`));
    const actions = el('div','card-actions');
    const open = button('Open project',() => openProject(p.id)); open.className='primary';
    const original = button('Read original',() => openReader(p.id, 'original')); original.hidden=!isEpub(p);
    const completionKnown = details.total > 0;
    const exportChapters = p.snapshot?.novel?.chapters?.filter(chapter => !p.snapshot.exportExcluded?.includes(chapter.id)) || [];
    const complete = isEpub(p) && exportChapters.length > 0 && exportChapters.every(chapter => p.snapshot.translations?.[chapter.id]?.trim() && !p.snapshot.translations[chapter.id].endsWith('…PARTIAL'));
    const translated = button('Read translation',() => openReader(p.id, 'translated'));
    translated.hidden=!isEpub(p); translated.disabled=completionKnown&&!complete;
    if (!complete && isEpub(p)) translated.title=completionKnown ? 'Finish every selected chapter to unlock this edition.' : 'Check whether the cloud project has a complete translated edition.';
    actions.append(open,original,translated,button('Export project',() => downloadProject(p)));
    if (p.owner === owner()) {
      if (user) actions.append(button('Share',() => showShare(p)));
      actions.append(button('Rename',() => showManage('rename',p)),button(p.archived?'Restore':'Archive',() => showManage('archive',p)),button('Delete',() => showManage('delete',p)));
    }
    card.append(actions); $('projects').append(card);
  });
}
function renderInvitationInbox() {
  $('resume-strip').hidden=true; $('count').textContent=String(invitations.length); $('projects').replaceChildren();
  if (!invitations.length) {
    const box=el('div','empty'),mark=el('span','empty-mark','00');mark.setAttribute('aria-hidden','true');
    box.append(mark,el('h3','','No pending invitations.'),el('p','','Project invitations sent to your account will appear here.'),button('Back to my library',()=>setCollection('active')));
    $('projects').append(box); return;
  }
  invitations.forEach(invitation=>{
    const card=el('article','project-card invitation-card');
    card.append(el('p','stamp','PROJECT INVITATION'),el('h3','',invitation.project_title),el('p','muted',`${invitation.inviter_name} invited you as an ${invitation.role}.`),el('p','stamp',`Sent ${new Date(invitation.created_at).toLocaleDateString()}`));
    const actions=el('div','card-actions');
    const accept=button('Accept',async()=>{
      accept.disabled=true; decline.disabled=true; status('Accepting invitation…');
      try { await remote.respondToInvitation(invitation.id,true); libraryView='projects'; await refresh(); status('Project added to your library.'); }
      catch(error){status(errorMessage(error));accept.disabled=false;decline.disabled=false;}
    }); accept.className='primary';
    const decline=button('Decline',async()=>{
      accept.disabled=true; decline.disabled=true;
      try { await remote.respondToInvitation(invitation.id,false); await refresh(); status('Invitation declined.'); }
      catch(error){status(errorMessage(error));accept.disabled=false;decline.disabled=false;}
    });
    actions.append(accept,decline); card.append(actions); $('projects').append(card);
  });
}
$('filter').onchange = render; $('search').oninput = render; $('refresh').onclick = refresh;
function setCollection(value){libraryView='projects';$('filter').value=value;$('search').value='';render();}
$('nav-active').onclick=()=>setCollection('active');
$('nav-archived').onclick=()=>setCollection('archived');
$('nav-inbox').onclick=()=>{libraryView='inbox';$('search').value='';render();};
function setLayout(value){
  $('projects').classList.toggle('list-view',value==='list');
  ['grid','list'].forEach(mode=>$('view-'+mode).setAttribute('aria-pressed',String(value===mode)));
  localStorage.setItem('dusk-library-layout',value);
}
$('view-grid').onclick=()=>setLayout('grid');$('view-list').onclick=()=>setLayout('list');
setLayout(localStorage.getItem('dusk-library-layout')==='list'?'list':'grid');
document.addEventListener('keydown',event=>{
  if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!$('library').hidden&&!document.querySelector('dialog[open]')&&!event.target.closest('input,textarea,select,[contenteditable]')){
    event.preventDefault();$('search').focus();
  }
});
let importingProject = false;
function showProjectDialog(importing = false) {
  importingProject = importing;
  $('project-form').reset(); $('new-error').textContent='';
  $('project-dialog-eyebrow').textContent = importing ? 'RESTORE A PROJECT' : 'A NEW CHAPTER';
  $('project-dialog-title').textContent = importing ? 'Import a project' : 'Start a project';
  $('new-title-label').hidden = importing;
  $('new-title').required = !importing;
  $('new-file-label').firstChild.textContent = importing ? 'DuskTranslate project ZIP' : 'Original book or project backup';
  $('new-file').accept = importing ? '.zip,application/zip' : '.epub,.json,.txt,.zip';
  $('new-file-help').innerHTML = importing
    ? 'Choose a project ZIP exported by DuskTranslate. It restores the original book, translations, glossary, and reading position.'
    : 'EPUB, source JSON, TXT, or backup ZIP · up to 20 MB.<br>Your original file is kept for future exports.';
  $('create-submit').textContent = importing ? 'Import project' : 'Create project';
  $('project-dialog').showModal();
}
$('new-project').onclick = () => showProjectDialog();
$('import-project').onclick = () => showProjectDialog(true);
$('welcome-signin').onclick=()=>showAuth('signin');$('welcome-signup').onclick=()=>showAuth('signup');
$('welcome-guest').onclick=()=>{guestMode=true;sessionStorage.setItem('dusk-guest','true');refresh();};
$('new-file').onchange = () => { if (!$('new-title').value) $('new-title').value = ($('new-file').files[0]?.name || '').replace(/\.[^.]+$/,'').slice(0,120); };
$('project-form').onsubmit = async e => {
  e.preventDefault(); if (working) return;
  working=true; $('create-submit').disabled=true; $('new-error').textContent='';
  try {
    let file = $('new-file').files[0]; validateFile(file);
    if (importingProject && !/\.zip$/i.test(file.name)) throw new Error('Choose a DuskTranslate project ZIP.');
    let snapshot = null, importedTitle = '';
    if (/\.zip$/i.test(file.name)) {
      const {default:JSZip} = await import('jszip');
      const archive = await JSZip.loadAsync(file);
      if (Object.values(archive.files).reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>100*1024*1024) throw new Error('Expanded backup exceeds 100 MB.');
      if (!archive.file('project.json')) throw new Error('This ZIP is not a DuskTranslate project backup.');
      const record = JSON.parse(await archive.file('project.json').async('string'));
      if (typeof record.fileName!=='string' || !/\.(epub|json|txt)$/i.test(record.fileName) || !archive.file(record.fileName.replace(/[\\/]/g,'_'))) throw new Error('Backup original book is missing or invalid.');
      snapshot=cleanSnapshot(record.snapshot);
      importedTitle=typeof record.title === 'string' ? record.title.trim().slice(0,120) : '';
      file=new File([await archive.file(record.fileName.replace(/[\\/]/g,'_')).async('arraybuffer')],record.fileName);
      validateFile(file);
    }
    const title = (importingProject ? importedTitle : $('new-title').value.trim()) || $('new-title').value.trim();
    if (!title) throw new Error(importingProject ? 'This backup does not include a usable project title.' : 'Enter a project title.');
    let p = { id:crypto.randomUUID(), owner:owner(), title, file, fileName:file.name, snapshot, archived:false, revision:1, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), dirty:false };
    if (user) p = await remote.create(p);
    await local.put(p); $('project-dialog').close(); await refresh(); await openProject(p.id);
  } catch(err) { $('new-error').textContent = errorMessage(err); }
  finally { working=false; $('create-submit').disabled=false; }
};
async function acquire(id) {
  if (!navigator.locks) throw new Error('This browser cannot safely lock projects. Please use a recent Firefox, Chrome, or Safari.');
  return new Promise((resolve,reject) => {
    navigator.locks.request(`dusk-project-${owner()}-${id}`, { ifAvailable:true }, async lock => {
      if (!lock) { reject(new Error('This project is already open in another tab. Close it there first.')); return; }
      await new Promise(release => { releaseLock=release; resolve(); });
    }).catch(reject);
  });
}
async function loadProject(id) {
  const cached = await local.get(owner(), id);
  if (!user) return cached;
  if (cached?.dirty) return cached;
  try {
    return { ...(await remote.open(id)), cacheOwner:owner() };
  } catch (error) {
    if (!navigator.onLine && cached?.snapshot && cached?.file) return cached;
    throw error;
  }
}
async function openProject(id, updateRoute = true) {
  if (active || readerOpen || closing || opening) return;
  opening = true;
  try {
    await acquire(id); status('Opening your book…');
    active = await loadProject(id);
    if (!active) throw new Error('Project not found. Refresh your library.');
    active.accessRole = active.owner === owner() ? 'owner' : active.collaborators?.find(member => member.user_id === user?.id)?.role || 'viewer';
    generation = active.dirty ? 1 : 0; persisted=0; saveError=''; streaming=false; editorReady=false;
    $('library').hidden=true; $('workspace').hidden=false; document.body.classList.add('workspace-open');
    $('project-title').textContent=active.title; announceSave('Opening…');
    // A hard reload can miss the editor's ready message; load is a reliable second handshake.
    $('editor').onload = () => setTimeout(openActiveEditorProject, 0);
    $('editor').src='/editor/index.html'; status('');
    if (updateRoute) navigate(projectRoute('/editor', id));
  } catch(e) { status(errorMessage(e)); active=null; releaseLock?.(); releaseLock=null; }
  finally { opening=false; }
}
function readerFontSize() {
  const stored = Number(localStorage.getItem(READER_FONT_KEY));
  return Number.isFinite(stored) ? Math.min(READER_FONT_MAX, Math.max(READER_FONT_MIN, stored)) : READER_FONT_DEFAULT;
}
function setReaderFontSize(value) {
  const size = Math.min(READER_FONT_MAX, Math.max(READER_FONT_MIN, value));
  localStorage.setItem(READER_FONT_KEY, String(size));
  $('reader-page').style.setProperty('--reader-font-size', `${size}px`);
  $('reader-page').style.setProperty('--reader-image-max', `${Math.round(900 * size / READER_FONT_DEFAULT)}px`);
  $('reader-font-value').textContent = `${size} px`;
}
function renderReader() {
  if (!readerBook) return;
  const chapter = readerBook.chapters[readerChapter];
  $('reader-title').textContent = readerBook.title;
  $('reader-chapter-count').textContent = `Section ${String(readerChapter).padStart(2, '0')} of ${readerBook.chapters.length}`;
  $('reader-chapter-title').textContent = chapter.title;
  $('reader-content').replaceChildren(...(chapter.blocks || chapter.paragraphs.map(text => ({ type:'text', text }))).map(block => {
    if (block.type === 'image') {
      const figure = el('figure', 'reader-image'), image = document.createElement('img');
      image.src = block.src; image.alt = block.alt || ''; image.loading = 'lazy'; image.decoding = 'async'; figure.append(image);
      if (block.alt) figure.append(el('figcaption', '', block.alt));
      return figure;
    }
    return el('p', '', block.text);
  }));
  $('reader-chapters').replaceChildren(...readerBook.chapters.map((item, index) => {
    const chapterButton = button(`${String(index).padStart(2, '0')}  ${item.title}`, () => {
      readerChapter = index;
      renderReader();
      $('reader-page').scrollTo({ top: 0, behavior: 'smooth' });
      $('reader-page').focus({ preventScroll: true });
    });
    chapterButton.setAttribute('aria-current', String(index === readerChapter));
    chapterButton.setAttribute('aria-label', `Read section ${index}: ${item.title}`);
    return chapterButton;
  }));
  setReaderFontSize(readerFontSize());
}
function prepareReader(title, edition, preserveReturn = false) {
  if (!preserveReturn) readerReturn = $('welcome').hidden ? 'library' : 'welcome';
  readerOpen = true; readerBook = null; readerChapter = 0;
  $('welcome').hidden = true; $('library').hidden = true; $('reader').hidden = false;
  document.body.classList.add('reader-open');
  $('reader-title').textContent = title;
  $('reader-edition').textContent = edition;
  $('reader-chapter-count').textContent = '';
  $('reader-chapter-title').textContent = 'Opening EPUB...';
  $('reader-status').textContent = 'Reading book structure';
  $('reader-chapters').replaceChildren(); $('reader-content').replaceChildren();
  $('reader-editor').hidden = true;
}
async function presentReader(file, fileName, edition, project = null, preserveReturn = false) {
  prepareReader(project?.title || fileName.replace(/\.epub$/i, ''), edition, preserveReturn);
  readerProject = project;
  try {
    readerBook = await readEpub(file, fileName); renderReader();
    $('reader-editor').hidden = !project;
    $('reader-status').textContent = 'Ready to read';
    $('reader-page').focus({ preventScroll: true });
  } catch (error) {
    $('reader-chapter-title').textContent = 'This EPUB could not be opened.';
    $('reader-status').textContent = 'Reader error';
    $('reader-content').append(el('p', '', errorMessage(error)));
  }
}
async function openReader(id, edition = 'original', updateRoute = true) {
  if (active || readerOpen || opening) return;
  opening = true;
  status('Opening EPUB reader...');
  try {
    const project = await loadProject(id);
    if (!project?.file || !isEpub(project)) throw new Error('This project does not contain an EPUB file.');
    const file = edition === 'translated' ? await buildTranslatedEpub(project.file, project.snapshot) : project.file;
    await presentReader(file, project.fileName, edition === 'translated' ? 'TRANSLATED EDITION' : 'ORIGINAL EDITION', project);
    if (updateRoute) navigate(projectRoute('/reader', id, edition));
    status('');
  } catch (error) {
    status(errorMessage(error));
  } finally { opening = false; }
}
function leaveReader({ updateRoute = true } = {}) {
  if (!readerOpen) return;
  readerBook?.chapters.flatMap(chapter => chapter.blocks || []).filter(block => block.type === 'image').forEach(block => URL.revokeObjectURL(block.src));
  readerOpen = false; readerProject = null; readerBook = null; readerChapter = 0;
  $('reader').hidden = true; document.body.classList.remove('reader-open');
  if (updateRoute) navigate(readerReturn === 'welcome' ? '/' : '/home');
  refresh();
  requestAnimationFrame(() => $(readerReturn === 'welcome' ? 'welcome-reader' : 'library-reader').focus());
}
function chooseReaderFile() { $('reader-file').value=''; $('reader-file').click(); }
$('welcome-reader').onclick = chooseReaderFile;
$('library-reader').onclick = chooseReaderFile;
$('reader-open-file').onclick = chooseReaderFile;
$('reader-file').onchange = async () => {
  const file = $('reader-file').files[0];
  if (!file) return;
  try { validateFile(file); await presentReader(file, file.name, 'STANDALONE EPUB', null, readerOpen); navigate('/reader'); }
  catch (error) { prepareReader(file.name, 'STANDALONE EPUB', readerOpen); $('reader-chapter-title').textContent='This EPUB could not be opened.'; $('reader-status').textContent='Reader error'; $('reader-content').append(el('p', '', errorMessage(error))); }
};
$('reader-back').onclick = leaveReader;
$('reader-editor').onclick = async () => { if (readerProject?.id) { const id = readerProject.id; leaveReader({ updateRoute:false }); await openProject(id); } };
$('reader-font-down').onclick = () => setReaderFontSize(readerFontSize() - READER_FONT_STEP);
$('reader-font-reset').onclick = () => setReaderFontSize(READER_FONT_DEFAULT);
$('reader-font-up').onclick = () => setReaderFontSize(readerFontSize() + READER_FONT_STEP);
document.addEventListener('keydown', event => {
  if (!readerOpen || document.querySelector('dialog[open]') || event.target.closest('input,textarea,select,button,[contenteditable]')) return;
  if (event.key === '-' || event.key === '_') { event.preventDefault(); setReaderFontSize(readerFontSize() - READER_FONT_STEP); }
  if (event.key === '+' || event.key === '=') { event.preventDefault(); setReaderFontSize(readerFontSize() + READER_FONT_STEP); }
  if (event.key === '0') { event.preventDefault(); setReaderFontSize(READER_FONT_DEFAULT); }
  if (event.key === 'Escape') { event.preventDefault(); leaveReader(); }
});
async function flush() {
  if (!active || persisted === generation) return;
  if (saveTask) { await saveTask; if (persisted !== generation && !saveError) return flush(); return; }
  const project = active;
  saveTask = (async () => {
    try {
      while (active === project && persisted !== generation) {
        const version = generation;
        const copy = { ...project, snapshot:cleanSnapshot(project.snapshot), updatedAt:new Date().toISOString(), dirty:isCloud() };
        announceSave(isCloud() ? 'Saving to cloud…' : 'Saving on device…');
        await local.patch(copy);
        if (isCloud()) {
          const saved = await remote.save(copy);
          project.revision = saved.revision;
          project.updatedAt = saved.updatedAt;
          await draftQueue;
          await local.patch({ ...project, snapshot:cleanSnapshot(project.snapshot), revision:saved.revision, updatedAt:saved.updatedAt, dirty:generation !== version });
        } else project.updatedAt=copy.updatedAt;
        persisted=version; project.dirty=generation !== version; saveError='';
      }
      announceSave(isCloud() ? 'Saved to your account' : 'Saved on this device');
    } catch(e) { saveError=errorMessage(e); announceSave(`${saveError} Use Save now to retry or download a backup.`); }
  })();
  await saveTask; saveTask=null;
}
let draftQueue = Promise.resolve();
function openDictionary() {
  if (!active) return;
  const dialog=$('dictionary-dialog');
  if(dialog.open)dialog.close();else dialog.showModal();
}
const dictionaryDialog=$('dictionary-dialog');
dictionaryDialog.addEventListener('click',event=>{
  const box=dictionaryDialog.getBoundingClientRect();
  if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dictionaryDialog.close();
});
window.addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== $('editor').contentWindow || !active) return;
  if (e.data.type === 'editor:presence-location' && e.data.projectId === active.id) {
    projectPresence?.update(e.data.location); return;
  }
  if (e.data.type === 'editor:findNavigate') {
    focusFindMatch(findReplaceIndex + Number(e.data.delta || 0));
    return;
  }
  if (e.data.type === 'editor:action') {
    if (e.data.action === 'library') leave();
    if (e.data.action === 'save') saveNow();
    if (e.data.action === 'backup') downloadBackup();
    if (e.data.action === 'exportSettings') showExportSettings();
    if (e.data.action === 'findReplace') showFindReplace();
    if (e.data.action === 'findReview') showFindReplace(true);
    if (e.data.action === 'consistency') checkConsistency();
    if (e.data.action === 'consistencyReview') checkConsistency();
    return;
  }
  if (e.data.type === 'editor:dictionary') {
    if (e.data.projectId === active.id) openDictionary();
    return;
  }
  if (e.data.type === 'editor:ready') {
    openActiveEditorProject(); return;
  }
  if (e.data.projectId !== active.id) return;
  if (e.data.type === 'editor:error') { announceSave(`Could not open book: ${e.data.message}`); return; }
  if (e.data.type === 'editor:loaded') {
    editorReady=true;
    projectPresence?.stop(); projectPresence=null;
    if (user && isCloud()) {
      const id=active.id;
      projectPresence=startProjectPresence(cloud,id,user.id,presence=>{
        if (active?.id === id) $('editor').contentWindow?.postMessage({type:'host:presence',...presence},location.origin);
      });
    }
  }
  if (e.data.type !== 'editor:state') return;
  try {
    active.snapshot=cleanSnapshot(e.data.snapshot); generation++;
    streaming=Boolean(e.data.busy); $('back').disabled=streaming;
    active.dirty=isCloud();
    const draft={...active,updatedAt:new Date().toISOString()};
    // Preserve edits promptly even if cloud writes fail or the network disappears.
    draftQueue=draftQueue.catch(()=>{}).then(()=>local.patch(draft)).catch(err=>{saveError=errorMessage(err);announceSave(saveError);});
    announceSave(streaming?'Translating; saving partial progress…':'Unsaved changes…');
    if (!saveTimer) saveTimer=setTimeout(async()=>{saveTimer=null;await draftQueue;await flush();},1200);
  } catch(err) { announceSave(errorMessage(err)); }
});
async function saveNow() { saveError=''; await draftQueue; await flush(); }
$('save-now').onclick = saveNow;
async function leave({ updateRoute = true } = {}) {
  if (!active || streaming || closing) return;
  closing=true; clearTimeout(saveTimer); saveTimer=null;
  await draftQueue; saveError=''; await flush();
  if (saveError) {
    const cached=await local.get(owner(),active.id);
    const safe=cached&&JSON.stringify(cached.snapshot)===JSON.stringify(cleanSnapshot(active.snapshot));
    if(!safe||!window.confirm('Cloud sync is incomplete, but your latest draft is saved on this device. Return to the library and retry later?')){closing=false;return;}
  }
  projectPresence?.stop(); projectPresence=null;
  $('editor').src='about:blank'; active=null; editorReady=false; $('workspace').hidden=true; $('library').hidden=false; document.body.classList.remove('workspace-open'); releaseLock?.(); releaseLock=null; closing=false; await refresh(); $('search').focus();
  if (updateRoute) navigate('/home');
}
$('back').onclick=leave;
$('brand').onclick=e=>{e.preventDefault();if(active)leave();else if(readerOpen)leaveReader();else if(!user){guestMode=false;sessionStorage.removeItem('dusk-guest');refresh();}};
async function downloadBackup() {
  if (!active) return;
  await draftQueue; await flush();
  await downloadProject(active);
}
async function projectBackupBlob(project) {
  if (!project?.file || !project?.snapshot) throw new Error('Open this project once before exporting it.');
  const { default:JSZip } = await import('jszip'); const zip=new JSZip();
  const originalName=project.fileName.replace(/[\\/]/g,'_');
  const snapshot=cleanSnapshot(project.snapshot);
  zip.file(originalName,project.file);
  zip.file('project.json',JSON.stringify({schemaVersion:2,exportedAt:new Date().toISOString(),title:project.title,fileName:project.fileName,snapshot},null,2));
  const translations=textExport(snapshot);
  if (translations) zip.file('translation.txt',translations);
  return zip.generateAsync({type:'blob'});
}
async function downloadProject(project) {
  try {
    const loaded=project.file ? project : await loadProject(project.id);
    if (!loaded) throw new Error('Project not found. Refresh your library and try again.');
    download(`${safeFileName(loaded.title)}-project.zip`,await projectBackupBlob(loaded));
    status('Project export is ready. Keep the ZIP somewhere safe.');
  } catch(error) { status(errorMessage(error)); }
}
$('backup').onclick=downloadBackup;
window.addEventListener('beforeunload',e=>{if(active&&(persisted!==generation||streaming)){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{projectPresence?.stop();projectPresence=null;});
window.addEventListener('online',()=>{if(active){saveError='';flush();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});

let sharingProject = null;
function renderCollaborators(members) {
  const list = $('share-members');
  list.replaceChildren();
  if (!members.length) { list.append(el('p','share-empty','No collaborators yet.')); return; }
  members.forEach(member => {
    const row = el('div','share-member'), details = el('div','',member.email);
    const role=document.createElement('select'); role.className='share-role';
    role.setAttribute('aria-label',`Access level for ${member.email}`);
    ['viewer','editor'].forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value==='editor'?'Editor':'Viewer';option.selected=member.role===value;role.append(option);});
    role.onchange=async()=>{
      role.disabled=true; remove.disabled=true; $('share-error').textContent='';
      try { await remote.changeCollaboratorRole(sharingProject.id,member.user_id,role.value); await renderShareMembers(); await refresh(); }
      catch(error){$('share-error').textContent=errorMessage(error);role.value=member.role;role.disabled=false;remove.disabled=false;}
    };
    const remove = button('Remove',async() => {
      role.disabled=true; remove.disabled = true; $('share-error').textContent = '';
      try { await remote.removeCollaborator(sharingProject.id, member.user_id); await renderShareMembers(); await refresh(); }
      catch (error) { $('share-error').textContent = errorMessage(error); role.disabled=false;remove.disabled = false; }
    });
    row.append(details,role,remove); list.append(row);
  });
}
function renderPendingInvitations(invites) {
  const list=$('share-invites'); list.replaceChildren();
  if (!invites.length) { list.append(el('p','share-empty','No pending invitations.')); return; }
  invites.forEach(invitation=>{
    const row=el('div','share-member'),details=el('div','',invitation.email);
    details.append(el('small','',`${invitation.role} · sent ${new Date(invitation.created_at).toLocaleDateString()}`));
    const revoke=button('Revoke',async()=>{
      revoke.disabled=true; $('share-error').textContent='';
      try { await remote.revokeInvitation(invitation.id); await renderShareMembers(); }
      catch(error){$('share-error').textContent=errorMessage(error);revoke.disabled=false;}
    });
    row.append(details,revoke);list.append(row);
  });
}
async function renderShareMembers() {
  if (!sharingProject) return;
  const projectId = sharingProject.id;
  try {
    const [members,invites] = await Promise.all([remote.collaborators(projectId),remote.invitations(projectId)]);
    if (sharingProject?.id === projectId) { renderCollaborators(members);renderPendingInvitations(invites); }
  } catch (error) {
    if (sharingProject?.id === projectId) {
      $('share-members').replaceChildren(el('p','share-empty','Could not load collaborators.'),button('Retry',async () => {
        $('share-error').textContent = '';
        try { await renderShareMembers(); }
        catch (retryError) { $('share-error').textContent = errorMessage(retryError); }
      }));
      $('share-invites').replaceChildren();
    }
    throw error;
  }
}
async function showShare(project) {
  if (!user || project.owner !== user.id) return;
  sharingProject = project; $('share-title').textContent = `Share “${project.title}”`; $('share-form').reset(); $('share-error').textContent = '';
  $('share-members').replaceChildren(el('p','share-empty','Loading collaborators…'));
  $('share-invites').replaceChildren(el('p','share-empty','Loading invitations…'));
  $('share-dialog').showModal();
  try { await renderShareMembers(); } catch (error) { $('share-error').textContent = errorMessage(error); }
}
$('share-form').onsubmit = async event => {
  event.preventDefault(); if (!sharingProject || working) return;
  working = true; $('share-submit').disabled = true; $('share-error').textContent = '';
  try {
    const emails=[...new Set($('share-email').value.split(/[\s,;]+/).map(email=>email.trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) throw new Error('Enter at least one email address.');
    const results=await remote.invite(sharingProject.id,emails.map(email=>({email,role:$('share-role').value})));
    const invited=results.filter(result=>result.outcome==='invited').length;
    const skipped=results.filter(result=>result.outcome!=='invited').map(result=>`${result.email} (${result.outcome.replace('_',' ')})`);
    $('share-email').value = ''; await renderShareMembers(); await refresh();
    $('share-error').textContent=skipped.length?`${invited} invitation${invited===1?'':'s'} sent. Skipped: ${skipped.join(', ')}.`:`${invited} invitation${invited===1?'':'s'} sent.`;
  } catch (error) { $('share-error').textContent = errorMessage(error); }
  finally { working = false; $('share-submit').disabled = false; }
};

function showManage(kind,p) {
  manage={kind,p}; $('manage-error').textContent=''; $('rename-label').hidden=kind!=='rename'; $('rename-title').required=kind==='rename'; $('rename-title').value=p.title;
  $('manage-title').textContent=kind==='rename'?'Rename project':kind==='delete'?'Delete this project?':p.archived?'Restore project?':'Archive project?';
  $('manage-info').textContent=kind==='delete'?`This removes “${p.title}”, its original file, and saved progress from this library. Download a backup first if you need to keep it.`:kind==='archive'?'Archived projects keep their book and all saved progress. Find them using the library filter.':'';
  $('manage-submit').textContent=kind==='delete'?'Delete project':'Save'; $('manage-dialog').showModal();
}
$('manage-form').onsubmit=async e=>{
  e.preventDefault(); if(working)return; working=true; $('manage-submit').disabled=true;
  try {
    await acquire(manage.p.id);
    const cached=await local.get(owner(),manage.p.id);
    let p=user?(cached?.dirty?cached:await remote.open(manage.p.id)):cached;
    if(manage.kind==='delete'){if(user)await remote.remove(p);await local.remove(owner(),p.id);}
    else {
      if(manage.kind==='rename'){const name=$('rename-title').value.trim();if(!name)throw new Error('Enter a title.');p.title=name;}
      else p.archived=!p.archived;
      if(user){const saved=await remote.save(p);p={...p,...saved};}
      p.updatedAt=new Date().toISOString();await local.put(p);
    }
    $('manage-dialog').close();await refresh();
  }catch(err){$('manage-error').textContent=errorMessage(err);}
  finally{releaseLock?.();releaseLock=null;working=false;$('manage-submit').disabled=false;}
};

let findReplaceMatches = [], findReplacePreview = null, findReplaceIndex = -1, preserveEditorReview = false;
function createFindRegex(findText, caseSensitive, matchMode = 'substring') {
  const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Unicode-aware boundaries keep exact-word searches out of longer names and words.
  const pattern = matchMode === 'word' ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  return new RegExp(pattern, caseSensitive ? 'gu' : 'giu');
}
function findReplaceFingerprint() {
  return JSON.stringify(active?.snapshot?.translations || {});
}
function invalidateFindReplacePreview(message = '') {
  findReplaceMatches = []; findReplacePreview = null; findReplaceIndex = -1;
  $('find-preview').hidden = true; $('find-navigation').hidden = true; $('replace-btn').hidden = true;
  if (active) $('editor').contentWindow.postMessage({ type: 'host:clearFind' }, location.origin);
  if (message) $('find-error').textContent = message;
}
function focusFindMatch(index) {
  if (!findReplaceMatches.length || !findReplacePreview) return;
  findReplaceIndex = (index + findReplaceMatches.length) % findReplaceMatches.length;
  const match = findReplaceMatches[findReplaceIndex];
  $('find-position').textContent = `${findReplaceIndex + 1} of ${findReplaceMatches.length}`;
  Array.from($('match-list').children).forEach((item, itemIndex) => {
    const selected = itemIndex === findReplaceIndex;
    item.setAttribute('aria-selected', String(selected));
    if (selected) item.scrollIntoView({ block: 'nearest' });
  });
  $('editor').contentWindow.postMessage({
    type: 'host:findFocus', chapterIndex: match.chapterIndex, matchIndex: match.matchIndex,
    findText: findReplacePreview.findText, caseSensitive: findReplacePreview.caseSensitive, matchMode: findReplacePreview.matchMode, target: 'translation',
    position: findReplaceIndex + 1, total: findReplaceMatches.length
  }, location.origin);
}
function showFindReplace(preserve = false) {
  if (!active) return;
  if (!preserve || !findReplacePreview) {
    $('find-replace-form').reset();
    $('find-error').textContent = '';
    invalidateFindReplacePreview();
  }
  $('find-replace-dialog').showModal();
}
$('find-replace-dialog').addEventListener('close', () => {
  // Only a selected result hands the review controls to the editor header.
  if (!preserveEditorReview) invalidateFindReplacePreview();
  preserveEditorReview = false;
});
$('consistency-dialog').addEventListener('close', () => {
  if (!preserveEditorReview && active) $('editor').contentWindow.postMessage({ type: 'host:clearFind' }, location.origin);
  preserveEditorReview = false;
});
['find-text','replace-text','case-sensitive','find-match-mode'].forEach(id => $(id).addEventListener(['case-sensitive','find-match-mode'].includes(id) ? 'change' : 'input', () => {
  if (findReplacePreview) invalidateFindReplacePreview('Preview updated. Review the replacement again.');
}));
$('preview-btn').onclick = () => {
  const findText = $('find-text').value;
  const caseSensitive = $('case-sensitive').checked;
  const matchMode = $('find-match-mode').value;
  if (!findText) {
    $('find-error').textContent = 'Enter text to find';
    return;
  }
  findReplaceMatches = [];
  const snapshot = active.snapshot;
  const regex = createFindRegex(findText, caseSensitive, matchMode);
  snapshot.novel.chapters.forEach((ch, idx) => {
    const translation = snapshot.translations[ch.id];
    if (!translation) return;
    const matches = [...translation.matchAll(regex)];
    matches.forEach(match => {
      const start = Math.max(0, match.index - 30);
      const end = Math.min(translation.length, match.index + match[0].length + 30);
      const context = translation.slice(start, end);
      findReplaceMatches.push({ chapterId: ch.id, chapterIndex: idx, matchIndex: match.index, context });
    });
  });
  if (findReplaceMatches.length === 0) {
    $('find-error').textContent = 'No matches found';
    invalidateFindReplacePreview();
    $('find-error').textContent = 'No matches found';
    return;
  }
  $('find-error').textContent = '';
  $('match-list').replaceChildren();
  findReplaceMatches.forEach((match, matchIndex) => {
    const chapterNum = match.chapterIndex + 1;
    const item = button(`Chapter ${chapterNum}: ...${match.context}...`, () => {
      focusFindMatch(matchIndex);
      preserveEditorReview = true;
      $('find-replace-dialog').close();
    });
    item.className = 'match-item'; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
    $('match-list').append(item);
  });
  const hasReplacement = $('replace-text').value.length > 0;
  $('find-preview').hidden = false; $('find-navigation').hidden = false; $('replace-btn').hidden = !hasReplacement;
  $('replace-btn').textContent = `Replace all (${findReplaceMatches.length} matches)`;
  findReplacePreview={findText,replaceText:$('replace-text').value,caseSensitive,matchMode,fingerprint:findReplaceFingerprint()};
  focusFindMatch(0);
};
$('find-previous').onclick = () => focusFindMatch(findReplaceIndex - 1);
$('find-next').onclick = () => focusFindMatch(findReplaceIndex + 1);
$('find-replace-form').onsubmit = async e => {
  e.preventDefault();
  const findText = $('find-text').value;
  const replaceText = $('replace-text').value;
  const caseSensitive = $('case-sensitive').checked;
  const matchMode = $('find-match-mode').value;
  if (!findReplacePreview || findReplaceMatches.length === 0) {
    $('find-error').textContent = 'Click Preview changes first';
    return;
  }
  if (!replaceText) {
    $('find-error').textContent = 'Enter replacement text before replacing. Searching never deletes text.';
    return;
  }
  if (findText !== findReplacePreview.findText || replaceText !== findReplacePreview.replaceText || caseSensitive !== findReplacePreview.caseSensitive || matchMode !== findReplacePreview.matchMode || findReplaceFingerprint() !== findReplacePreview.fingerprint) {
    invalidateFindReplacePreview('Translations changed since preview. Review the replacement again.');
    return;
  }
  $('editor').contentWindow.postMessage({
    type: 'host:findReplace',
    findText,
    replaceText,
    caseSensitive,
    matchMode
  }, location.origin);
  $('find-replace-dialog').close();
  findReplacePreview=null;
};

async function checkConsistency() {
  if (!active) return;
  $('consistency-dialog').showModal();
  $('consistency-status').textContent = 'Analyzing translations...';
  $('consistency-results').replaceChildren();
  $('consistency-error').textContent = '';
  await new Promise(resolve => setTimeout(resolve, 50));
  const snapshot = active.snapshot;
  const sourceToTranslations = new Map();
  let checkedChapters = 0, skippedPartial = 0, comparedPairs = 0;
  snapshot.novel.chapters.forEach((ch, idx) => {
    const chapterTranslation = snapshot.translations[ch.id];
    if (!chapterTranslation || chapterTranslation.endsWith('…PARTIAL')) { if (chapterTranslation?.endsWith('…PARTIAL')) skippedPartial++; return; }
    const sourceSentences = ch.text.split(/[。！？\n]+/).filter(s => s.trim().length > 10);
    const translationSentences = chapterTranslation.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
    if (!sourceSentences.length || !translationSentences.length) return;
    checkedChapters++;
    sourceSentences.forEach((source, sIdx) => {
      const sourceKey = source.trim().slice(0, 100);
      if (!sourceKey) return;
      const tlIdx = Math.floor((sIdx / sourceSentences.length) * translationSentences.length);
      const translation = translationSentences[tlIdx]?.trim();
      if (!translation) return;
      comparedPairs++;
      if (!sourceToTranslations.has(sourceKey)) {
        sourceToTranslations.set(sourceKey, new Map());
      }
      const translationMap = sourceToTranslations.get(sourceKey);
      if (!translationMap.has(translation)) {
        translationMap.set(translation, { chapters: [], locations: [] });
      }
      const entry = translationMap.get(translation);
      entry.chapters.push(idx + 1);
      entry.locations.push({ chapterIndex: idx, matchIndex: chapterTranslation.indexOf(translation) });
    });
  });
  const inconsistencies = [];
  sourceToTranslations.forEach((translationMap, source) => {
    if (translationMap.size > 1) {
      const translations = Array.from(translationMap.entries()).map(([tl, value]) => ({ translation: tl, ...value }));
      inconsistencies.push({ source, translations });
    }
  });
  inconsistencies.sort((a, b) => b.translations.length - a.translations.length);
  $('consistency-status').textContent = inconsistencies.length > 0
    ? `Found ${inconsistencies.length} potential inconsistencies across ${checkedChapters} comparable chapters.`
    : `No repeated source passages produced conflicting matches across ${checkedChapters} comparable chapters.`;
  if (inconsistencies.length === 0) {
    $('consistency-results').append(el('p', '', comparedPairs ? 'This heuristic only compares repeated source passages with roughly aligned output. It does not confirm that the full translation is consistent.' : 'There were no comparable source/translation sentence pairs to check.'));
    if (skippedPartial) $('consistency-results').append(el('p', '', `${skippedPartial} partial chapter${skippedPartial === 1 ? ' was' : 's were'} skipped.`));
    return;
  }
  $('consistency-results').append(el('p', '', `Heuristic only: compare these passages manually before changing your translation.${skippedPartial ? ` ${skippedPartial} partial chapter${skippedPartial === 1 ? ' was' : 's were'} skipped.` : ''}`));
  inconsistencies.slice(0, 20).forEach(issue => {
    const card = el('div', '');
    card.style.cssText = 'border:1.5px solid var(--border);padding:12px;margin:8px 0;border-radius:4px';
    const sourceLabel = el('p', '', 'Source: ');
    sourceLabel.style.cssText = 'font-size:.75rem;font-weight:700;color:var(--muted);margin-bottom:4px';
    const sourceText = el('p', '', issue.source);
    sourceText.style.cssText = 'font-family:serif;font-size:.9rem;margin-bottom:12px;font-style:italic';
    const varLabel = el('p', '', `${issue.translations.length} different translations found:`);
    varLabel.style.cssText = 'font-size:.75rem;font-weight:700;color:var(--muted);margin-bottom:6px';
    card.append(sourceLabel, sourceText, varLabel);
    issue.translations.forEach((item) => {
      const variant = el('div', '');
      variant.style.cssText = 'margin:6px 0;padding:6px;background:var(--aged);border-radius:3px';
      const tlText = el('p', '', `"${item.translation}"`);
      tlText.style.cssText = 'font-size:.85rem;margin-bottom:4px';
      const chapters = el('p', '', `Chapters: ${item.chapters.slice(0, 5).join(', ')}${item.chapters.length > 5 ? '...' : ''}`);
      chapters.style.cssText = 'font-size:.75rem;color:var(--muted);font-family:monospace';
      const openMatch = button(`Open chapter ${item.chapters[0]} match`, () => {
        const location = item.locations[0];
        preserveEditorReview = true;
        $('consistency-dialog').close();
        $('editor').contentWindow.postMessage({
          type: 'host:findFocus', chapterIndex: location.chapterIndex, matchIndex: location.matchIndex,
          findText: item.translation, caseSensitive: true, target: 'translation',
          reviewAction: 'consistencyReview', reviewLabel: 'Review'
        }, location.origin);
      });
      openMatch.className = 'consistency-open';
      variant.append(tlText, chapters, openMatch);
      card.append(variant);
    });
    $('consistency-results').append(card);
  });
  if (inconsistencies.length > 20) {
    $('consistency-results').append(el('p', '', `...and ${inconsistencies.length - 20} more issues. Fix the top ones first.`));
  }
}

function showAuth(mode='signin') {
  if(authBusy)return;
  authMode=mode; $('auth-message').textContent=''; $('password').value='';
  $('auth-title').textContent={signin:'Welcome back.',signup:'Make room for your books.',reset:'Reset your password.',update:'Choose a new password.'}[mode];
  $('auth-submit').textContent={signin:'Sign in',signup:'Create account',reset:'Send reset link',update:'Update password'}[mode];
  $('auth-switch').textContent=mode==='signup'?'I already have an account':'Create an account';
  $('password-label').hidden=mode==='reset'; $('password').required=mode!=='reset'; $('password').autocomplete=mode==='signin'?'current-password':'new-password';
  $('email').parentElement.hidden=mode==='update'; $('email').required=mode!=='update';
  $('google-option').hidden=mode==='reset'||mode==='update';
  $('forgot').hidden=mode==='reset'||mode==='update';
  $('auth-switch').hidden=mode==='update';
  $('remember-row').hidden=mode==='update';$('remember-me').checked=authStorage.remembered();
  $('consent-row').hidden=mode==='reset'||mode==='update';
  $('terms-accept').checked=false;
  $('terms-accept').required=mode==='signup';
  $('auth-info').textContent=cloud?'Use Google or your email and password. AI-provider keys are separate and never saved with your account.':'Cloud accounts are not configured on this deployment yet. Your browser library works now; account sign-in will be enabled when the project owner connects Supabase.';
  setAuthBusy(false);
  if(!$('auth-dialog').open)$('auth-dialog').showModal();
}
function setAuthBusy(busy) {
  authBusy=busy;
  $('auth-form').setAttribute('aria-busy',String(busy));
  ['auth-submit','google-auth'].forEach(id=>$(id).disabled=busy||!cloud);
  ['auth-switch','forgot'].forEach(id=>$(id).disabled=busy);
  $('google-label').textContent='Continue with Google';
}
async function startGoogleOAuth(remember) {
  if(!cloud)throw new Error('Cloud accounts are not configured on this deployment yet.');
  authStorage.choose(remember);
  if(!await googleAvailable())throw new Error('Google sign-in is not enabled yet. You can use email now; the project owner still needs to connect Google in Supabase.');
  const {error}=await cloud.auth.signInWithOAuth({provider:'google',options:{
    redirectTo:new URL('/',location.origin).href
  }});
  if(error)throw error;
}
$('google-auth').onclick=async()=>{
  if(!cloud||authBusy)return;
  if (!$('terms-accept').checked) { $('auth-message').textContent='Please accept the Terms and Privacy Policy before continuing.'; return; }
  setAuthBusy(true);$('google-label').textContent='Redirecting to Google...';$('auth-message').textContent='Taking you to Google. You will return to this page after signing in.';
  try{
    await startGoogleOAuth($('remember-me').checked);
  }catch(error){
    setAuthBusy(false);$('auth-message').textContent=errorMessage(error);
  }
};
// A browser Back navigation may restore the page while the OAuth button is busy.
window.addEventListener('pageshow',()=>setAuthBusy(false));
$('account').onclick=async()=>{
  if(user){const {error}=await cloud.auth.signOut();if(error){status(error.message);return;}user=null;guestMode=false;sessionStorage.removeItem('dusk-guest');navigate('/',true);await refresh();}
  else showAuth();
};
$('auth-switch').onclick=()=>showAuth(authMode==='signup'?'signin':'signup');
$('forgot').onclick=()=>showAuth('reset');
$('auth-form').onsubmit=async e=>{
  e.preventDefault();if(!cloud||authBusy)return;setAuthBusy(true);$('auth-message').textContent='';
  try{
    if(authMode!=='update')authStorage.choose($('remember-me').checked);
    const email=$('email').value.trim(),password=$('password').value;
    const redirectTo=location.origin+'/'; let result;
    if(authMode==='signup') result=await cloud.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
    else if(authMode==='reset') result=await cloud.auth.resetPasswordForEmail(email,{redirectTo});
    else if(authMode==='update') result=await cloud.auth.updateUser({password});
    else result=await cloud.auth.signInWithPassword({email,password});
    if(result.error)throw result.error;
    $('password').value='';
    if(authMode==='reset')$('auth-message').textContent='If that email has an account, a reset link is on its way.';
    else if(authMode==='signup'&&!result.data.session)$('auth-message').textContent='Check your email to confirm your account, then sign in.';
    else{user=result.data.user || user;$('auth-dialog').close();await refresh();}
  }catch(err){$('auth-message').textContent=errorMessage(err);}
  finally{setAuthBusy(false);}
};
let authError='',currentSession=null;
if(cloud){
  cloud.auth.onAuthStateChange((event,session)=>{
    const next=session?.user || null;
    if(next||event==='SIGNED_OUT'){guestMode=false;sessionStorage.removeItem('dusk-guest');}
    if(event==='PASSWORD_RECOVERY')setTimeout(()=>showAuth('update'),0);
    if(user?.id!==next?.id){
      projectPresence?.stop();projectPresence=null;
      if(active){$('editor').src='about:blank';active=null;releaseLock?.();releaseLock=null;$('workspace').hidden=true;$('library').hidden=false;document.body.classList.remove('workspace-open');}
      if (!next) navigate('/', true);
      user=next;setTimeout(refresh,0);
    }
  });
  // The SDK exchanges PKCE codes once during initialization, including recovery links.
  const initialized=await cloud.auth.initialize();
  const {data,error}=await cloud.auth.getSession();
  currentSession=data.session||null;authError=initialized.error?.message||error?.message||'';user=currentSession?.user || null;
  if(authParams.has('code')&&!user&&!authError)authError='This sign-in link expired or was opened in a different browser. Start sign-in again here.';
}
if(isAuthReturn){
  if(authParams.get('error')==='access_denied')authError='Sign-in was cancelled or access was denied. You can try Google again or use email.';
  else if(authParams.has('error')||authParams.has('error_description')||authParams.has('error_code'))authError='Sign-in could not be completed. Please try again, or ask the project owner to check the login configuration.';
  const clean=new URL(location.href),fragment=new URLSearchParams(clean.hash.slice(1));
  const fields=['code','sb_flow_id','error','error_code','error_description','access_token','refresh_token','provider_token','provider_refresh_token','expires_in','expires_at','token_type','type'];
  fields.forEach(key=>{clean.searchParams.delete(key);fragment.delete(key);});
  if(fields.some(key=>authReturn.hash.includes(key+'=')))clean.hash=fragment.toString();
  history.replaceState(history.state,'',clean);
}
await refresh();
async function restoreRoute() {
  const route = currentRoute(), projectId = new URLSearchParams(location.search).get('project');
  if (route === '/' && (user || guestMode)) { navigate('/home', true); return; }
  if (!user && !guestMode && route !== '/') { navigate('/', true); await refresh(); return; }
  if (route === '/editor') {
    if (!projectId) { navigate('/home', true); status('Choose a project before opening the editor.'); return; }
    await openProject(projectId, false);
    if (!active) navigate('/home', true);
  } else if (route === '/reader' && projectId) {
    const edition = new URLSearchParams(location.search).get('edition') === 'translated' ? 'translated' : 'original';
    await openReader(projectId, edition, false);
    if (!readerOpen) navigate('/home', true);
  } else if (route === '/reader') {
    prepareReader('EPUB reader', 'STANDALONE EPUB');
    $('reader-chapter-title').textContent = 'Choose an EPUB to begin.';
    $('reader-status').textContent = 'Open an EPUB from this device';
  }
}
window.addEventListener('popstate', async () => {
  if (active) await leave({ updateRoute:false });
  else if (readerOpen) leaveReader({ updateRoute:false });
  else await restoreRoute();
});
await restoreRoute();
if(authError){showAuth();$('auth-message').textContent=authError;}
