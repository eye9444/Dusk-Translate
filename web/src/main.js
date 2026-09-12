import './style.css';
import './glass.css';
import './welcome.css';
import './reader.css';
import { cloud, local, remote, googleAvailable, authStorage } from './store.js';
import { validateFile, cleanSnapshot, progress } from './model.js';
import { buildTranslatedEpub, readEpub } from './epub-reader.js';

const $ = id => document.getElementById(id);
const authReturn = new URL(location.href);
const authParams = new URLSearchParams(authReturn.hash.slice(1));
authReturn.searchParams.forEach((value,key)=>authParams.set(key,value));
const isAuthReturn = ['code','error','error_description','error_code','access_token'].some(key=>authParams.has(key));
const googleIntent = authReturn.searchParams.get('auth') === 'google';
const googleRememberIntent = authReturn.searchParams.get('remember') !== 'false';
const oauthPopup = sessionStorage.getItem('dusk-oauth-popup') === 'true';
let authBusy = false;
let oauthWindow = null;
let oauthWatch = null;
let googleOAuthStarted = false;
let user = null, projects = [], active = null, working = false;
let generation = 0, persisted = 0, saveTask = null, saveTimer = null, saveError = '', streaming = false;
let authMode = 'signin', manage = null, releaseLock = null;
let editorReady = false, closing = false, opening = false, libraryRequest = 0;
let readerOpen = false, readerProject = null, readerBook = null, readerChapter = 0, readerReturn = 'library';
let renderedOwner = null;
let guestMode=sessionStorage.getItem('dusk-guest')==='true';
const READER_FONT_KEY = 'dusk-reader-font-size';
const READER_FONT_DEFAULT = 20, READER_FONT_STEP = 2, READER_FONT_MIN = 14, READER_FONT_MAX = 32;
const owner = () => user?.id || 'guest';
const isCloud = () => active && active.owner !== 'guest';
const isEpub = project => /\.epub$/i.test(project?.fileName || '');
function status(message) { $('library-status').textContent = message; }
function errorMessage(error) { return error?.message || 'Something went wrong. Please try again.'; }
function announceSave(message) {
  $('save-status').textContent = message;
  if (active) $('editor').contentWindow?.postMessage({type:'host:status',message}, location.origin);
}
function el(tag, className, value) { const n = document.createElement(tag); n.className = className; if (value !== undefined) n.textContent = value; return n; }
function button(label, action) { const n = el('button','',label); n.addEventListener('click', action); return n; }
function download(name, data) { const url = URL.createObjectURL(data); const a = el('a',''); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
function theme(value) { document.body.classList.toggle('eclipse', value === 'eclipse'); localStorage.setItem('theme',value); $('editor').contentWindow?.postMessage({type:'host:theme',theme:value}, location.origin); }
theme(localStorage.getItem('theme') || 'dusk');
$('theme').onclick = () => theme(document.body.classList.contains('eclipse') ? 'dusk' : 'eclipse');
document.querySelectorAll('[data-close]').forEach(n => n.onclick = () => n.closest('dialog').close());

async function refresh() {
  const request = ++libraryRequest;
  const libraryOwner = owner();
  let cached = [];
  $('welcome').hidden=Boolean(user)||guestMode;
  $('library').hidden=Boolean(active)||(!user&&!guestMode);
  if(renderedOwner!==libraryOwner){projects=[];renderedOwner=libraryOwner;render();}
  $('storage-label').textContent = user ? 'YOUR CLOUD LIBRARY' : 'THIS BROWSER';
  $('account').textContent = user ? 'Sign out' : 'Sign in';
  $('storage-caption').textContent=user?'Your personal cloud library':'A library on this device';
  $('storage-info').textContent = user ? `Signed in as ${user.email}. Cloud books and progress are private to your account. Local projects stay in your browser library.` : 'Saved in this browser, including the original EPUB. Clearing site data removes local projects. Sign in for a cloud library.';
  if(user)status('Refreshing your account library...');
  try {
    cached=await local.list(libraryOwner);
    const result=user?await remote.list():cached;
    if(request !== libraryRequest || libraryOwner !== owner()) return;
    projects=user?result.map(p=>{
      const draft=cached.find(c=>c.id===p.id);
      return draft?.dirty?draft:draft?.revision===p.revision?{...p,snapshot:draft.snapshot}:p;
    }):result;
    status('');render();
  }catch(e){
    if(request !== libraryRequest || libraryOwner !== owner())return;
    projects=cached;
    render();status(`${errorMessage(e)}${projects.length?' Showing projects cached on this device.':''}`);
  }
}
function render() {
  const archived=$('filter').value==='archived',query=$('search').value.trim().toLowerCase();
  const sorted=[...projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const view = sorted.filter(p => p.archived === archived && p.title.toLowerCase().includes(query));
  $('active-count').textContent=String(projects.filter(p=>!p.archived).length);
  $('archive-count').textContent=String(projects.filter(p=>p.archived).length);
  $('collection-title').textContent=archived?'Archived projects':'Active translation projects';
  $('collection-name').textContent=archived?'Archive':'My library';
  ['active','archived'].forEach(value=>{
    const nav=$('nav-'+value);
    if(value===$('filter').value)nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');
  });
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
    card.append(el('p','stamp',`${p.fileName.split('.').pop().toUpperCase()} / ${p.owner === 'guest' ? 'ON THIS DEVICE' : 'CLOUD'}`),el('h3','',p.title));
    card.append(el('p','muted',p.snapshot ? `${details.done} of ${details.total} chapters complete` : 'Open to continue your translation'));
    if (p.snapshot) { const bar = document.createElement('progress'); bar.max=100; bar.value=details.percent; bar.setAttribute('aria-label',`${details.percent}% translated`); card.append(bar); }
    card.append(el('p','stamp',p.dirty?'Saved on device / cloud sync pending':`Saved ${new Date(p.updatedAt).toLocaleDateString()}`));
    const actions = el('div','card-actions');
    const open = button('Open project',() => openProject(p.id)); open.className='primary';
    const original = button('Read original',() => openReader(p.id, 'original')); original.hidden=!isEpub(p);
    const completionKnown = details.total > 0;
    const complete = isEpub(p) && completionKnown && details.done === details.total;
    const translated = button('Read translation',() => openReader(p.id, 'translated'));
    translated.hidden=!isEpub(p); translated.disabled=completionKnown&&!complete;
    if (!complete && isEpub(p)) translated.title=completionKnown ? `Translate all ${details.total} chapters to unlock this edition.` : 'Check whether the cloud project has a complete translated edition.';
    actions.append(open,original,translated,button('Rename',() => showManage('rename',p)),button(p.archived?'Restore':'Archive',() => showManage('archive',p)),button('Delete',() => showManage('delete',p)));
    card.append(actions); $('projects').append(card);
  });
}
$('filter').onchange = render; $('search').oninput = render; $('refresh').onclick = refresh;
function setCollection(value){$('filter').value=value;$('search').value='';render();}
$('nav-active').onclick=()=>setCollection('active');
$('nav-archived').onclick=()=>setCollection('archived');
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
$('new-project').onclick = () => { $('project-form').reset(); $('new-error').textContent=''; $('project-dialog').showModal(); };
$('welcome-signin').onclick=()=>showAuth('signin');$('welcome-signup').onclick=()=>showAuth('signup');
$('welcome-guest').onclick=()=>{guestMode=true;sessionStorage.setItem('dusk-guest','true');refresh();};
$('new-file').onchange = () => { if (!$('new-title').value) $('new-title').value = ($('new-file').files[0]?.name || '').replace(/\.[^.]+$/,'').slice(0,120); };
$('project-form').onsubmit = async e => {
  e.preventDefault(); if (working) return;
  working=true; $('create-submit').disabled=true; $('new-error').textContent='';
  try {
    let file = $('new-file').files[0]; validateFile(file);
    let snapshot = null;
    if (/\.zip$/i.test(file.name)) {
      const {default:JSZip} = await import('jszip');
      const archive = await JSZip.loadAsync(file);
      if (Object.values(archive.files).reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>100*1024*1024) throw new Error('Expanded backup exceeds 100 MB.');
      if (!archive.file('project.json')) throw new Error('This ZIP is not a DuskTranslate project backup.');
      const record = JSON.parse(await archive.file('project.json').async('string'));
      if (typeof record.fileName!=='string' || !/\.(epub|json|txt)$/i.test(record.fileName) || !archive.file(record.fileName.replace(/[\\/]/g,'_'))) throw new Error('Backup original book is missing or invalid.');
      snapshot=cleanSnapshot(record.snapshot);
      file=new File([await archive.file(record.fileName.replace(/[\\/]/g,'_')).async('arraybuffer')],record.fileName);
      validateFile(file);
    }
    const title = $('new-title').value.trim(); if (!title) throw new Error('Enter a project title.');
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
    return await remote.open(id);
  } catch (error) {
    if (!navigator.onLine && cached?.snapshot && cached?.file) return cached;
    throw error;
  }
}
async function openProject(id) {
  if (active || readerOpen || closing || opening) return;
  opening = true;
  try {
    await acquire(id); status('Opening your book…');
    active = await loadProject(id);
    if (!active) throw new Error('Project not found. Refresh your library.');
    generation = active.dirty ? 1 : 0; persisted=0; saveError=''; streaming=false; editorReady=false;
    $('library').hidden=true; $('workspace').hidden=false; document.body.classList.add('workspace-open');
    $('project-title').textContent=active.title; announceSave('Opening…');
    $('editor').src='/editor/index.html'; status('');
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
  $('reader-font-value').textContent = `${size} px`;
}
function renderReader() {
  if (!readerBook) return;
  const chapter = readerBook.chapters[readerChapter];
  $('reader-title').textContent = readerBook.title;
  $('reader-chapter-count').textContent = `Chapter ${readerChapter + 1} of ${readerBook.chapters.length}`;
  $('reader-chapter-title').textContent = chapter.title;
  $('reader-content').replaceChildren(...chapter.paragraphs.map(text => el('p', '', text)));
  $('reader-chapters').replaceChildren(...readerBook.chapters.map((item, index) => {
    const chapterButton = button(`${String(index + 1).padStart(2, '0')}  ${item.title}`, () => {
      readerChapter = index;
      renderReader();
      $('reader-page').scrollTo({ top: 0, behavior: 'smooth' });
      $('reader-page').focus({ preventScroll: true });
    });
    chapterButton.setAttribute('aria-current', String(index === readerChapter));
    chapterButton.setAttribute('aria-label', `Read chapter ${index + 1}: ${item.title}`);
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
}
async function presentReader(file, fileName, edition, project = null, preserveReturn = false) {
  prepareReader(project?.title || fileName.replace(/\.epub$/i, ''), edition, preserveReturn);
  readerProject = project;
  try {
    readerBook = await readEpub(file, fileName); renderReader();
    $('reader-status').textContent = 'Ready to read';
    $('reader-page').focus({ preventScroll: true });
  } catch (error) {
    $('reader-chapter-title').textContent = 'This EPUB could not be opened.';
    $('reader-status').textContent = 'Reader error';
    $('reader-content').append(el('p', '', errorMessage(error)));
  }
}
async function openReader(id, edition = 'original') {
  if (active || readerOpen || opening) return;
  opening = true;
  status('Opening EPUB reader...');
  try {
    const project = await loadProject(id);
    if (!project?.file || !isEpub(project)) throw new Error('This project does not contain an EPUB file.');
    const file = edition === 'translated' ? await buildTranslatedEpub(project.file, project.snapshot) : project.file;
    await presentReader(file, project.fileName, edition === 'translated' ? 'TRANSLATED EDITION' : 'ORIGINAL EDITION', project);
    status('');
  } catch (error) {
    status(errorMessage(error));
  } finally { opening = false; }
}
function leaveReader() {
  if (!readerOpen) return;
  readerOpen = false; readerProject = null; readerBook = null; readerChapter = 0;
  $('reader').hidden = true; document.body.classList.remove('reader-open');
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
  try { validateFile(file); await presentReader(file, file.name, 'STANDALONE EPUB', null, readerOpen); }
  catch (error) { prepareReader(file.name, 'STANDALONE EPUB', readerOpen); $('reader-chapter-title').textContent='This EPUB could not be opened.'; $('reader-status').textContent='Reader error'; $('reader-content').append(el('p', '', errorMessage(error))); }
};
$('reader-back').onclick = leaveReader;
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
window.addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== $('editor').contentWindow || !active) return;
  if (e.data.type === 'editor:action') {
    if (e.data.action === 'library') leave();
    if (e.data.action === 'save') saveNow();
    if (e.data.action === 'backup') downloadBackup();
    return;
  }
  if (e.data.type === 'editor:ready') {
    $('editor').contentWindow.postMessage({type:'host:open',project:active}, location.origin);
    theme(localStorage.getItem('theme') || 'dusk');
    announceSave('Opening…'); return;
  }
  if (e.data.projectId !== active.id) return;
  if (e.data.type === 'editor:error') { announceSave(`Could not open book: ${e.data.message}`); return; }
  if (e.data.type === 'editor:loaded') editorReady=true;
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
async function leave() {
  if (!active || streaming || closing) return;
  closing=true; clearTimeout(saveTimer); saveTimer=null;
  await draftQueue; saveError=''; await flush();
  if (saveError) {
    const cached=await local.get(active.owner,active.id);
    const safe=cached&&JSON.stringify(cached.snapshot)===JSON.stringify(cleanSnapshot(active.snapshot));
    if(!safe||!window.confirm('Cloud sync is incomplete, but your latest draft is saved on this device. Return to the library and retry later?')){closing=false;return;}
  }
  $('editor').src='about:blank'; active=null; editorReady=false; $('workspace').hidden=true; $('library').hidden=false; document.body.classList.remove('workspace-open'); releaseLock?.(); releaseLock=null; closing=false; await refresh(); $('search').focus();
}
$('back').onclick=leave;
$('brand').onclick=e=>{e.preventDefault();if(active)leave();else if(readerOpen)leaveReader();else if(!user){guestMode=false;sessionStorage.removeItem('dusk-guest');refresh();}};
async function downloadBackup() {
  if (!active) return;
  const { default:JSZip } = await import('jszip'); const zip=new JSZip();
  zip.file(active.fileName.replace(/[\\/]/g,'_'),active.file);
  zip.file('project.json',JSON.stringify({title:active.title,fileName:active.fileName,snapshot:cleanSnapshot(active.snapshot)},null,2));
  download(`${active.title.replace(/[^a-z0-9_-]/gi,'_')}-backup.zip`,await zip.generateAsync({type:'blob'}));
}
$('backup').onclick=downloadBackup;
window.addEventListener('beforeunload',e=>{if(active&&(persisted!==generation||streaming)){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{if(active){saveError='';flush();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});

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
  const {data,error}=await cloud.auth.signInWithOAuth({provider:'google',options:{
    redirectTo:location.origin+'/',skipBrowserRedirect:true,queryParams:{prompt:'select_account'}
  }});
  if(error)throw error;
  if(!data?.url)throw new Error('Could not start Google sign-in. Please try again.');
  location.assign(data.url);
}
async function runGoogleOAuth() {
  if(googleOAuthStarted)return;
  googleOAuthStarted=true;
  try{await startGoogleOAuth(googleRememberIntent);}
  catch(error){
    setAuthBusy(false);$('auth-message').textContent=errorMessage(error);
    if(window.opener&&!window.opener.closed)window.opener.postMessage({type:'dusk:oauth-error',message:errorMessage(error)},location.origin);
  }
}
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin)return;
  if(googleIntent&&event.source===window.opener&&event.data?.type==='dusk:oauth-start'){
    await runGoogleOAuth();return;
  }
  if((oauthPopup||googleIntent)&&event.source===window.opener&&event.data?.type==='dusk:oauth-ack'){
    sessionStorage.removeItem('dusk-oauth-popup');window.close();return;
  }
  if(oauthWindow&&event.source===oauthWindow&&event.data?.type==='dusk:oauth-ready'){
    event.source.postMessage({type:'dusk:oauth-start'},location.origin);return;
  }
  if(!oauthWindow||event.source!==oauthWindow||!['dusk:oauth-complete','dusk:oauth-error'].includes(event.data?.type))return;
  try{
    if(event.data.type==='dusk:oauth-error')throw new Error(event.data.message||'Google sign-in could not be completed.');
    const {data,error}=await cloud.auth.setSession({access_token:event.data.accessToken,refresh_token:event.data.refreshToken});
    if(error)throw error;
    user=data.user||data.session?.user||user;
    if($('auth-dialog').open)$('auth-dialog').close();
    await refresh();
    event.source.postMessage({type:'dusk:oauth-ack'},location.origin);
  }catch(error){
    $('auth-message').textContent=errorMessage(error);setAuthBusy(false);
    event.source.postMessage({type:'dusk:oauth-ack'},location.origin);
  }finally{
    if(oauthWatch){clearInterval(oauthWatch);oauthWatch=null;}
    oauthWindow=null;setAuthBusy(false);
  }
});
$('google-auth').onclick=()=>{
  if(!cloud||authBusy)return;
  if (!$('terms-accept').checked) { $('auth-message').textContent='Please accept the Terms and Privacy Policy before continuing.'; return; }
  authStorage.choose($('remember-me').checked);
  const launch=new URL('/',location.origin);launch.searchParams.set('auth','google');launch.searchParams.set('remember',String($('remember-me').checked));
  oauthWindow=window.open(launch,'dusk-google-auth','popup=yes,width=520,height=720,resizable=yes,scrollbars=yes');
  if(oauthWindow){
    setAuthBusy(true);$('google-label').textContent='Waiting for Google...';$('auth-message').textContent='Complete sign-in in the Google window. This page will update automatically.';
    oauthWatch=setInterval(()=>{
      if(!oauthWindow?.closed)return;
      clearInterval(oauthWatch);oauthWatch=null;oauthWindow=null;setAuthBusy(false);
      $('auth-message').textContent='Google sign-in was closed before completion. You can try again.';
    },500);
  }
  else{setAuthBusy(false);$('auth-message').textContent='Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';}
};
// A browser Back navigation may restore the page while the OAuth button is busy.
window.addEventListener('pageshow',()=>setAuthBusy(false));
$('account').onclick=async()=>{
  if(user){const {error}=await cloud.auth.signOut();if(error){status(error.message);return;}user=null;guestMode=false;sessionStorage.removeItem('dusk-guest');await refresh();}
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
      if(active){$('editor').src='about:blank';active=null;releaseLock?.();releaseLock=null;$('workspace').hidden=true;$('library').hidden=false;document.body.classList.remove('workspace-open');}
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
if(oauthPopup&&window.opener&&!window.opener.closed&&!googleIntent&&(currentSession||authError)){
  window.opener.postMessage(currentSession?{type:'dusk:oauth-complete',accessToken:currentSession.access_token,refreshToken:currentSession.refresh_token}:{type:'dusk:oauth-error',message:authError},location.origin);
}else if(googleIntent&&!user){
  const clean=new URL(location.href);clean.searchParams.delete('auth');clean.searchParams.delete('remember');history.replaceState(history.state,'',clean);
  sessionStorage.setItem('dusk-oauth-popup','true');
  showAuth('signin');setAuthBusy(true);$('google-label').textContent='Opening Google...';
  if(window.opener&&!window.opener.closed)window.opener.postMessage({type:'dusk:oauth-ready'},location.origin);
  else await runGoogleOAuth();
}else if(authError){showAuth();$('auth-message').textContent=authError;}
