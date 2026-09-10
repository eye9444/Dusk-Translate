import './style.css';
import { cloud, local, remote } from './store.js';
import { validateFile, cleanSnapshot, progress } from './model.js';

const $ = id => document.getElementById(id);
const authReturn = new URL(location.href);
const authParams = new URLSearchParams(authReturn.hash.slice(1));
authReturn.searchParams.forEach((value,key)=>authParams.set(key,value));
const isAuthReturn = ['code','error','error_description','error_code','access_token'].some(key=>authParams.has(key));
let authBusy = false;
let user = null, projects = [], active = null, working = false;
let generation = 0, persisted = 0, saveTask = null, saveTimer = null, saveError = '', streaming = false;
let authMode = 'signin', manage = null, releaseLock = null;
let editorReady = false, closing = false, opening = false, libraryRequest = 0;
const owner = () => user?.id || 'guest';
const isCloud = () => active && active.owner !== 'guest';
function status(message) { $('library-status').textContent = message; }
function errorMessage(error) { return error?.message || 'Something went wrong. Please try again.'; }
function announceSave(message) { $('save-status').textContent = message; }
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
  $('storage-label').textContent = user ? 'YOUR CLOUD LIBRARY' : 'THIS BROWSER';
  $('account').textContent = user ? 'Sign out' : 'Sign in';
  $('storage-info').textContent = user ? `Signed in as ${user.email}. Cloud books and progress are private to your account. Local projects stay in your browser library.` : 'Saved in this browser, including the original EPUB. Clearing site data removes local projects. Sign in for a cloud library.';
  try { const result = user ? await remote.list() : await local.list('guest'); if(request !== libraryRequest || libraryOwner !== owner()) return; projects = result; status(''); render(); }
  catch(e) { if(request === libraryRequest) status(errorMessage(e)); }
}
function render() {
  const view = projects.filter(p => p.archived === ($('filter').value === 'archived') && p.title.toLowerCase().includes($('search').value.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  $('count').textContent = String(view.length); $('projects').replaceChildren();
  if (!view.length) { const box = el('div','empty'); box.append(el('h3','','Your next chapter starts here.'),el('p','','Create a project, add a book, and give your translation a place to live.')); $('projects').append(box); }
  view.forEach(p => {
    const card = el('article','project-card');
    const details = progress(p.snapshot);
    card.append(el('p','stamp',`${p.fileName.split('.').pop().toUpperCase()} / ${p.owner === 'guest' ? 'ON THIS DEVICE' : 'CLOUD'}`),el('h3','',p.title));
    card.append(el('p','muted',p.snapshot ? `${details.done} of ${details.total} chapters complete` : 'Open to continue your translation'));
    if (p.snapshot) { const bar = document.createElement('progress'); bar.max=100; bar.value=details.percent; bar.setAttribute('aria-label',`${details.percent}% translated`); card.append(bar); }
    card.append(el('p','stamp',`Saved ${new Date(p.updatedAt).toLocaleDateString()}`));
    const actions = el('div','card-actions');
    const open = button('Open project',() => openProject(p.id)); open.className='primary';
    actions.append(open,button('Rename',() => showManage('rename',p)),button(p.archived?'Restore':'Archive',() => showManage('archive',p)),button('Delete',() => showManage('delete',p)));
    card.append(actions); $('projects').append(card);
  });
}
$('filter').onchange = render; $('search').oninput = render; $('refresh').onclick = refresh;
$('new-project').onclick = () => { $('project-form').reset(); $('new-error').textContent=''; $('project-dialog').showModal(); };
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
async function openProject(id) {
  if (active || closing || opening) return;
  opening = true;
  try {
    await acquire(id); status('Opening your book…');
    const cached = await local.get(owner(),id);
    if (user) {
      // An un-synced local draft always wins over a network fetch on reopening.
      active = cached?.dirty ? cached : await remote.open(id);
    } else active = cached;
    if (!active) throw new Error('Project not found. Refresh your library.');
    generation = active.dirty ? 1 : 0; persisted=0; saveError=''; streaming=false; editorReady=false;
    $('library').hidden=true; $('workspace').hidden=false; document.body.classList.add('workspace-open');
    $('project-title').textContent=active.title; announceSave('Opening…');
    $('editor').src='/editor/index.html'; status('');
  } catch(e) { status(errorMessage(e)); active=null; releaseLock?.(); releaseLock=null; }
  finally { opening=false; }
}
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
        await local.put(copy);
        if (isCloud()) {
          const saved = await remote.save(copy);
          project.revision = saved.revision;
          project.updatedAt = saved.updatedAt;
          await draftQueue;
          await local.put({ ...project, snapshot:cleanSnapshot(project.snapshot), revision:saved.revision, updatedAt:saved.updatedAt, dirty:generation !== version });
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
  if (e.data.type === 'editor:ready') {
    $('editor').contentWindow.postMessage({type:'host:open',project:active}, location.origin);
    theme(localStorage.getItem('theme') || 'dusk'); return;
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
    draftQueue=draftQueue.catch(()=>{}).then(()=>local.put(draft)).catch(err=>{saveError=errorMessage(err);announceSave(saveError);});
    announceSave(streaming?'Translating; saving partial progress…':'Unsaved changes…');
    if (!saveTimer) saveTimer=setTimeout(async()=>{saveTimer=null;await draftQueue;await flush();},1200);
  } catch(err) { announceSave(errorMessage(err)); }
});
$('save-now').onclick = async () => { saveError=''; await draftQueue; await flush(); };
async function leave() {
  if (!active || streaming || closing) return;
  closing=true; clearTimeout(saveTimer); saveTimer=null;
  await draftQueue; saveError=''; await flush();
  if (saveError) { closing=false; return; }
  $('editor').src='about:blank'; active=null; editorReady=false; $('workspace').hidden=true; $('library').hidden=false; document.body.classList.remove('workspace-open'); releaseLock?.(); releaseLock=null; closing=false; await refresh();
}
$('back').onclick=leave;
$('brand').onclick=e=>{e.preventDefault();if(active)leave();};
$('backup').onclick=async()=>{
  if (!active) return;
  const { default:JSZip } = await import('jszip'); const zip=new JSZip();
  zip.file(active.fileName.replace(/[\\/]/g,'_'),active.file);
  zip.file('project.json',JSON.stringify({title:active.title,fileName:active.fileName,snapshot:cleanSnapshot(active.snapshot)},null,2));
  download(`${active.title.replace(/[^a-z0-9_-]/gi,'_')}-backup.zip`,await zip.generateAsync({type:'blob'}));
};
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
$('google-auth').onclick=async()=>{
  if(!cloud||authBusy)return;
  setAuthBusy(true);$('google-label').textContent='Opening Google...';$('auth-message').textContent='';
  try{
    const {data,error}=await cloud.auth.signInWithOAuth({provider:'google',options:{
      redirectTo:location.origin+'/',skipBrowserRedirect:true,queryParams:{prompt:'select_account'}
    }});
    if(error)throw error;
    if(!data?.url)throw new Error('Could not start Google sign-in. Please try again.');
    location.assign(data.url);
  }catch(err){setAuthBusy(false);$('auth-message').textContent=errorMessage(err);}
};
// A browser Back navigation may restore the page while the OAuth button is busy.
window.addEventListener('pageshow',()=>setAuthBusy(false));
$('account').onclick=async()=>{
  if(user){const {error}=await cloud.auth.signOut();if(error){status(error.message);return;}user=null;await refresh();}
  else showAuth();
};
$('auth-switch').onclick=()=>showAuth(authMode==='signup'?'signin':'signup');
$('forgot').onclick=()=>showAuth('reset');
$('auth-form').onsubmit=async e=>{
  e.preventDefault();if(!cloud||authBusy)return;setAuthBusy(true);$('auth-message').textContent='';
  try{
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
let authError='';
if(cloud){
  cloud.auth.onAuthStateChange((event,session)=>{
    const next=session?.user || null;
    if(event==='PASSWORD_RECOVERY')setTimeout(()=>showAuth('update'),0);
    if(user?.id!==next?.id){
      if(active){$('editor').src='about:blank';active=null;releaseLock?.();releaseLock=null;$('workspace').hidden=true;$('library').hidden=false;document.body.classList.remove('workspace-open');}
      user=next;setTimeout(refresh,0);
    }
  });
  // The SDK exchanges PKCE codes once during initialization, including recovery links.
  const initialized=await cloud.auth.initialize();
  const {data,error}=await cloud.auth.getSession();
  authError=initialized.error?.message||error?.message||'';user=data.session?.user || null;
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
if(authError){showAuth();$('auth-message').textContent=authError;}
