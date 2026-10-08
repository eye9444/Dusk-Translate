import './style.css';
import './glass.css';
import './welcome.css';
import './launch.css';
import { commitQueue } from './quota-client.js';
import { createSpendingNotice } from './spending-notice.js';
import { createUpgradeDialog, showQuotaDialog } from './upgrade-dialog.js';
import { describeEntitlements, FEATURE_TIERS, TIER_LABELS } from './entitlements.js';
import './reader.css';
import { createPricingPage } from './pricing.js';
import { cloud, local, remote, googleAvailable, authStorage } from './store.js';
import { renderGoogleCredentialButton } from './google-identity.js';
import { validateFile, cleanSnapshot, progress } from './model.js';
import { buildTranslatedEpub, readEpub } from './epub-reader.js';
import { startProjectPresence } from './presence.js';
import { createComments } from './comments.js';
import { createReaderComments } from './reader-comments.js';
import { showCapacitySelection } from './capacity-dialog.js';
import { showReaderLinkDialog } from './reader-link-dialog.js';
import { renderRubyParagraph } from './ruby-renderer.js';
import { startCollaboration } from './collaboration.js';
import { startLocalDocument } from './local-document.js';
import { listEpubImages, validateReplacement, applyImageReplacements } from './image-assets.js';
import { setLoading } from './loading.js';

const $ = id => document.getElementById(id);
const bytesToBase64=bytes=>{let value='';for(let index=0;index<bytes.length;index+=0x8000)value+=String.fromCharCode(...bytes.subarray(index,index+0x8000));return btoa(value);};
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
let projectCollaboration = null;
let pendingRubySelection = null;
let imageDialogAssets = [], imageDialogUrls = [];
let readerOpen = false, readerProject = null, readerBook = null, readerChapter = 0, readerReturn = 'library';
let sharedReaderToken=null,readerRenderGeneration=0;
let renderedOwner = null;
let libraryView = 'projects';
let guestMode=sessionStorage.getItem('dusk-guest')==='true';
const READER_FONT_KEY = 'dusk-reader-font-size';
const READER_FONT_DEFAULT = 20, READER_FONT_STEP = 2, READER_FONT_MIN = 14, READER_FONT_MAX = 32;
const ROUTES = new Set(['/','/home','/editor','/reader','/pricing','/welcome']);
const owner = () => user?.id || 'guest';
const isCloud = (project=active) => project && project.storage!=='local' && project.owner !== 'guest';
const isEpub = project => /\.epub$/i.test(project?.fileName || '');
const comments = createComments({ cloud, local, getProject: () => active, getUser: () => user,
  onThreads: threads => $('editor').contentWindow?.postMessage({type:'host:comments',projectId:active?.id,threads:threads.map(thread=>{const location=projectCollaboration?.resolve(thread.anchor);return Number.isInteger(location?.start)?{...thread,anchor:{...thread.anchor,...location}}:thread;})},location.origin),
  makeAnchor: selection => projectCollaboration?.anchor(selection) || selection,
  resolveSharedAnchor: anchor => { const location=projectCollaboration?.resolve(anchor); return Number.isInteger(location?.start)&&Number.isInteger(location?.end)?location:null; },
  clearFocus: () => $('editor').contentWindow?.postMessage({ type:'host:clearComment', projectId:active?.id }, location.origin),
  focus: selection => $('editor').contentWindow?.postMessage({ type:'host:commentFocus', projectId:active.id, selection }, location.origin) });
const pricingPage = createPricingPage({
  createCheckout: async priceId => {
    if (!user) { showAuth(); throw new Error('Sign in before subscribing so your plan can be linked to your account.'); }
    return billingRequest('/api/paddle/checkout', 'POST', { priceId });
  },
  onFree: () => { navigate(user ? '/home' : '/'); refresh(); },
});
const publicComments=createReaderComments({root:$('reader-comments'),content:$('reader-content'),remote,getUser:()=>user,signIn:()=>showAuth(),onInvalid:error=>{
  $('reader-content').replaceChildren();$('reader-chapter-title').textContent='Reader access could not be confirmed';$('reader-status').textContent=errorMessage(error);
}});
function sendRuby(chapterId) {
  if(!active||!projectCollaboration)return;
  $('editor').contentWindow?.postMessage({type:'host:ruby',projectId:active.id,chapterId,annotations:projectCollaboration.ruby(chapterId)},location.origin);
}
function openRuby(selection){
  $('ruby-error').textContent='';pendingRubySelection=null;
  if(!projectCollaboration){$('ruby-error').textContent='Ruby text is available after cloud collaboration connects.';$('ruby-dialog').showModal();return;}
  if(!selection||!['source','translation'].includes(selection.pane)||selection.end<=selection.start){$('ruby-error').textContent='Select the base text in the source or translation pane first.';$('ruby-dialog').showModal();return;}
  pendingRubySelection=selection;$('ruby-base').textContent=selection.quote;$('ruby-reading').value='';$('ruby-published').checked=false;$('ruby-dialog').showModal();$('ruby-reading').focus();
}
$('ruby-form').onsubmit=event=>{event.preventDefault();if(!pendingRubySelection||!projectCollaboration)return;try{projectCollaboration.addRuby(pendingRubySelection,$('ruby-reading').value,$('ruby-published').checked);sendRuby(pendingRubySelection.chapterId);$('ruby-dialog').close();pendingRubySelection=null;}catch(error){$('ruby-error').textContent=errorMessage(error);}};
function clearImageUrls(){for(const url of imageDialogUrls)URL.revokeObjectURL(url);imageDialogUrls=[];}
async function replacementRows(project=active){return !project?[]:isCloud(project)?remote.imageAssets(project.id):local.imageAssets(project.id);}
async function projectFileWithReplacements(project){
  if(!project||!/\.epub$/i.test(project.fileName))return project?.file;
  const rows=await replacementRows(project),replacements=[];
  for(const row of rows.filter(item=>item.replacement_path))replacements.push({epubPath:row.epub_path,file:isCloud(project)?await remote.downloadImage(row.replacement_path):row.replacement});
  return applyImageReplacements(project.file,replacements);
}
async function renderImageAssets(){
  clearImageUrls();const previews=$('images-preview').checked,rows=await replacementRows(),byPath=new Map(rows.map(row=>[row.epub_path,row]));
  $('images-list').replaceChildren();
  for(const asset of imageDialogAssets){
    const row=byPath.get(asset.epubPath),card=el('article','image-asset'),title=el('strong','',asset.name),meta=el('small','',`${asset.mime} · ${(asset.bytes.length/1024).toFixed(1)} KB${row?.replacement_path?' · replaced':''}`),actions=el('div','image-asset-actions');
    const replacement=row?.replacement_path?(isCloud()?await remote.downloadImage(row.replacement_path):row.replacement):null;
    if(previews&&asset.replaceable){const source=replacement||new Blob([asset.bytes],{type:asset.mime}),url=URL.createObjectURL(source),preview=document.createElement('button'),image=document.createElement('img');preview.type='button';preview.className='image-preview-button';preview.setAttribute('aria-label',`Open full preview of ${asset.name}`);image.src=url;image.alt=asset.name;image.loading='lazy';preview.append(image);preview.onclick=()=>{$('image-preview-full').src=url;$('image-preview-full').alt=asset.name;$('image-preview-title').textContent=asset.name;$('image-preview-caption').textContent=`${asset.mime} · ${(asset.bytes.length/1024).toFixed(1)} KB${row?.replacement_path?' · replacement':''}`;$('image-preview-dialog').showModal();};imageDialogUrls.push(url);card.append(preview);}
    else if(previews&&!asset.replaceable)card.append(el('small','','Preview blocked for this image format. Download the original to inspect it safely.'));
    actions.append(button('Download',()=>download(asset.name,replacement||new Blob([asset.bytes],{type:asset.mime}))));
    if(active.accessRole!=='viewer'&&asset.replaceable){const label=el('label','','Replace'),input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';if(!active.entitlements?.capabilities.replaceImages){label.prepend(el('span','','♛ Pro · '));input.onclick=event=>{event.preventDefault();requireFeature('replaceImages');};}input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(!await requireFeature('replaceImages')){input.value='';return;}try{$('images-status').textContent='Validating replacement…';const checked=await validateReplacement(file,asset.bytes.length);if(isCloud()){let record=row;if(!record)record=await remote.registerImage(active.id,crypto.randomUUID(),asset.epubPath,asset.bytes.length,asset.mime);const ext=checked.mime==='image/png'?'png':checked.mime==='image/jpeg'?'jpg':'webp',path=`${active.owner}/${active.id}/images/${record.id}/replacement.${ext}`;await remote.uploadImage(path,file);await remote.setImageReplacement(active.id,record.id,path,checked);}else await local.putImage(active.id,asset.epubPath,file,checked);$('images-status').textContent='Replacement saved.';await renderImageAssets();}catch(error){$('images-status').textContent=errorMessage(error);}finally{input.value='';}};label.append(input);actions.append(label);}
    if(row?.replacement_path&&active.accessRole!=='viewer')actions.append(button('Restore original',async()=>{if(!await requireFeature('replaceImages'))return;try{if(isCloud()){const old=row.replacement_path;await remote.clearImageReplacement(active.id,row.id);await remote.deleteImage(old);}else await local.removeImage(active.id,asset.epubPath);$('images-status').textContent='Original restored.';await renderImageAssets();}catch(error){$('images-status').textContent=errorMessage(error);}}));
    card.append(title,meta,actions);$('images-list').append(card);
  }
}
async function showImages(){
  $('images-status').textContent='Reading EPUB images…';$('images-list').replaceChildren();$('images-dialog').showModal();
  try{if(!isEpub(active))throw new Error('This project does not contain an EPUB.');imageDialogAssets=await listEpubImages(active.file);$('images-status').textContent=`${imageDialogAssets.length} image assets found.`;await renderImageAssets();}catch(error){$('images-status').textContent=errorMessage(error);}
}
async function exportTranslatedEpub(){
  if(!active||!isEpub(active))return;
  try{announceSave('Building translated EPUB…');await projectCollaboration?.flush();await draftQueue;await flush();const rights=await currentEntitlements(),source=await projectFileWithReplacements(active),base=rights.capabilities.exportSelection?active.snapshot:{...active.snapshot,exportExcluded:[]},snapshot={...base,publishedRuby:Object.fromEntries(base.novel.chapters.map(chapter=>[chapter.id,projectCollaboration?.publishedRuby?.(chapter.id)||[]]))},file=await buildTranslatedEpub(source,snapshot);download(`${safeFileName(active.title)}-translated.epub`,file);announceSave('Translated EPUB downloaded');}
  catch(error){announceSave(`EPUB export failed: ${errorMessage(error)}`);}
}
$('images-preview').defaultChecked=true;
$('images-preview').checked=true;
$('images-preview').onchange=()=>renderImageAssets().catch(error=>$('images-status').textContent=errorMessage(error));
$('images-dialog').addEventListener('close',()=>{if($('image-preview-dialog').open)$('image-preview-dialog').close();$('image-preview-full').removeAttribute('src');clearImageUrls();});
for(const id of ['images-dialog','image-preview-dialog']){
  const dialog=$(id);
  let beganOutside=false;
  const outside=event=>{const box=dialog.getBoundingClientRect();return event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom;};
  dialog.addEventListener('pointerdown',event=>{beganOutside=event.target===dialog&&outside(event);});
  dialog.addEventListener('click',event=>{if(beganOutside&&event.target===dialog&&outside(event))dialog.close();beganOutside=false;});
}
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

async function billingRequest(path, method = 'GET', body) {
  const { data, error } = await cloud.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Please sign in again to manage billing.');
  const response = await fetch(path, {
    method,
    headers: { Authorization: 'Bearer ' + data.session.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && !payload.blocked) throw new Error(payload.error || 'Billing request failed.');
  return payload;
}

const confirmSpending = createSpendingNotice({getUser:()=>user,request:billingRequest});
const showUpgrade = createUpgradeDialog({createCheckout:priceId=>billingRequest('/api/paddle/checkout','POST',{priceId})});
async function currentEntitlements(project=active) {
  const data=project&&isCloud(project)
    ? await remote.entitlements(project.id)
    : user ? await billingRequest('/api/paddle/status') : {tier:'free'};
  const result={...data,...describeEntitlements(data.tier)};
  if(project&&!isCloud(project) && user&&result.capabilities.customPrompt)result.customInstructions=localStorage.getItem(`dusk-prompt:${user.id}:${project.id}`)||'';
  if(project && project===active){
    active.entitlements=result;
    $('editor').contentWindow?.postMessage({type:'host:entitlements',projectId:active.id,entitlements:result},location.origin);
  }
  return result;
}
async function requireFeature(feature) {
  try {
    const project=active,rights=await currentEntitlements();
    if(project!==active)return false;
    if(rights.capabilities[feature])return true;
    const labels={consistency:'Consistency checking',rubyEdit:'Editing ruby',replaceImages:'Replacing book images',exportSelection:'Choosing exported chapters',customPrompt:'Custom translation instructions',readerLinks:'Public reader links'};
    await showUpgrade({feature:labels[feature]||feature,required:TIER_LABELS[FEATURE_TIERS[feature]]});
  } catch(error){announceSave(errorMessage(error));}
  return false;
}
async function showCustomInstructions(){
  const project=active;
  if(!project || project.accessRole==='viewer')return;
  const dialog=document.createElement('dialog');dialog.className='quota-dialog';
  dialog.innerHTML='<form><h2>Translation instructions</h2><p>These instructions supplement the shared fidelity rules. They do not guarantee error-free translation.</p><label>Project instructions<textarea rows="8" maxlength="10000"></textarea></label><p role="status"></p><footer><button type="button">Cancel</button><button type="submit">Save instructions</button></footer></form>';
  const input=dialog.querySelector('textarea'),notice=dialog.querySelector('[role="status"]');
  input.value=project.entitlements?.customInstructions||'';
  dialog.querySelector('[type="button"]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    try{
      if(active!==project)throw new Error('Project changed. Reopen the instructions.');
      if(!await requireFeature('customPrompt'))return;
      if(!isCloud(project))localStorage.setItem(`dusk-prompt:${user.id}:${project.id}`,input.value);
      else await remote.setInstructions(project.id,input.value);
      await currentEntitlements(project);dialog.close();
    }catch(error){notice.textContent=errorMessage(error);}
  };
  document.body.append(dialog);dialog.showModal();input.focus();
}
async function quotaRequest(operation, data) {
  const result = await billingRequest('/api/translation-quota','POST',{...data,operation});
  void refreshQuotaMeter();
  if (result.blocked) {
    showQuotaDialog(result,()=>showUpgrade({feature:'Unlimited cloud translation'}));
    const reset = new Date(result.resetAt);
    throw new Error(`This chapter needs ${result.required.toLocaleString()} characters; you have ${result.remaining.toLocaleString()} remaining today. Resets ${reset.toLocaleString()}. Upgrade your plan or wait for reset.`);
  }
  return result;
}
let quotaMeterRequest = 0;
async function refreshQuotaMeter() {
  const project=active, sequence=++quotaMeterRequest;
  if(!project || !editorReady)return;
  let quota;
  try {
    quota=!isCloud(project) ? {local:true} : project.accessRole==='viewer'
      ? {readOnly:true}
      : await billingRequest('/api/translation-quota','POST',{operation:'status',projectId:project.id});
  } catch {
    quota={unavailable:true};
  }
  if(active===project && sequence===quotaMeterRequest)
    $('editor').contentWindow?.postMessage({type:'host:quota',projectId:project.id,quota},location.origin);
}
setInterval(()=>{void refreshQuotaMeter();},60000);
async function launchRequest(data) {
  if (data.action==='spending') return {accepted:await confirmSpending()};
  const project = active;
  if (!project || data.projectId!==project.id) throw new Error('Project changed. Please retry.');
  if (data.action==='reserve') {
    if (!await confirmSpending()) throw new Error('Translation canceled.');
    await currentEntitlements(project);
    if (!isCloud()) return {unlimited:true};
    await saveNow();
    if (saveError || active!==project || persisted!==generation) throw new Error('Save your chapter to the cloud before translating.');
    // Resolve durable unacknowledged commits before reserving a new attempt.
    for (const queued of await commitQueue.list()) {
      if (queued.userId!==user?.id) continue;
      await quotaRequest('commit',queued);
      await commitQueue.remove(queued.attemptId);
    }
  }
  if (!isCloud()) return {unlimited:true};
  const request = {projectId:project.id,attemptId:data.attemptId,chapterId:data.chapterId};
  if (data.action==='commit') {
    const text=project.snapshot.translations?.[data.chapterId] || '';
    request.outputHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
    await commitQueue.put({...request,userId:user.id});
    await saveNow();
    if(saveError || active!==project || persisted!==generation) throw new Error('Translation is preserved locally. Save to the cloud, then retry usage confirmation.');
    const result=await quotaRequest('commit',request);
    await commitQueue.remove(request.attemptId);
    return result;
  }
  return quotaRequest(data.action,request);
}

let provisioningTimer;
let provisioningGeneration = 0;
async function confirmProvisioning() {
  clearTimeout(provisioningTimer);
  const generation = ++provisioningGeneration;
  const title = $('subscription-welcome-title');
  const notice = $('provisioning-status');
  title.textContent = 'Checkout completed; confirming your plan';
  if (!user) { notice.textContent = 'Sign in to the account you used for checkout to confirm your plan.'; return; }
  try {
    const billing = await billingRequest('/api/paddle/status');
    if (generation !== provisioningGeneration || currentRoute() !== '/welcome') return;
    if (billing.provisioning === 'ready') {
      title.textContent = 'Your ' + billing.tier + ' subscription is ready.';
      notice.textContent = 'Your plan has been confirmed by the billing service.';
      return;
    }
    notice.textContent = 'Payment confirmation is still being processed. Your plan is not active yet. Please do not purchase again.';
    provisioningTimer = setTimeout(() => { if (currentRoute() === '/welcome') confirmProvisioning(); }, 5000);
  } catch {
    notice.textContent = 'We could not confirm your plan. Please retry; you do not need to pay again.';
  }
}
$('provisioning-retry').onclick = confirmProvisioning;

async function showBilling() {
  if (!user) { showAuth(); return; }
  const metadata=user.user_metadata||{};
  const avatar=$('billing-avatar');
  avatar.replaceChildren();
  const picture=metadata.avatar_url||metadata.picture||'';
  if(picture){
    const image=document.createElement('img');image.src=picture;image.alt='';image.referrerPolicy='no-referrer';
    image.onerror=()=>{avatar.textContent=(user.email||'?').slice(0,1).toUpperCase();};avatar.append(image);
  }else avatar.textContent=(user.email||'?').slice(0,1).toUpperCase();
  $('billing-email').textContent = user.email || '';
  const provider=user.app_metadata?.provider||user.identities?.[0]?.provider||'email';
  $('billing-provider').textContent = `Signed in with ${provider === 'google' ? 'Google' : provider === 'email' ? 'email and password' : provider}`;
  $('billing-access').textContent = 'Checking your access...';
  $('billing-plan').textContent = 'Checking your Paddle subscription...';
  $('billing-detail').textContent = '';
  $('billing-manage').disabled = true;
  $('billing-dialog').showModal();
  try {
    const billing = await billingRequest('/api/paddle/status');
    const tierLabel=TIER_LABELS[billing.tier]||billing.tier||'Starter';
    $('billing-access').textContent=billing.isSuperUser?`Owner access · ${tierLabel}`:billing.isBetaAccess?`Beta access · ${tierLabel}`:`${tierLabel} access`;
    const subscription = billing.subscription;
    if (billing.isBetaAccess && !subscription) {
      $('billing-plan').textContent = 'Teams beta access';
      const until = billing.betaAccessUntil ? new Date(billing.betaAccessUntil).toLocaleDateString(undefined,{dateStyle:'medium'}) : 'the end of your beta month';
      $('billing-detail').textContent = `Free Teams access through ${until}. No payment method is required; access ends automatically after the beta month.`;
      return;
    }
    if (!billing.customer) {
      $('billing-plan').textContent = 'No Paddle subscription yet.';
      $('billing-detail').textContent = 'Choose a plan when you are ready. Your account remains available on the free tier.';
      return;
    }
    if (!subscription) {
      $('billing-plan').textContent = 'No current subscription.';
      $('billing-detail').textContent = 'Use the Paddle portal to review any billing details.';
      $('billing-manage').disabled = false;
      return;
    }
    $('billing-plan').textContent = subscription.status === 'trialing' ? 'Free trial active' : 'Subscription: ' + subscription.status;
    $('billing-detail').textContent = subscription.scheduled_change_action
      ? 'A ' + subscription.scheduled_change_action + ' change is scheduled. Access continues until Paddle changes the subscription status.'
      : (billing.hasPaidAccess ? 'Paid access is active.' : 'Paid access is not active for this subscription status.');
    $('billing-manage').disabled = false;
  } catch (error) {
    $('billing-access').textContent = 'Access could not be confirmed';
    $('billing-plan').textContent = errorMessage(error);
  }
}

$('billing-manage').onclick = async () => {
  $('billing-manage').disabled = true;
  try {
    const portal = await billingRequest('/api/paddle/portal', 'POST');
    location.assign(portal.url);
  } catch (error) {
    $('billing-detail').textContent = errorMessage(error);
    $('billing-manage').disabled = false;
  }
};

$('pricing-manage').onclick = async () => {
  if (!user) { showAuth(); return; }
  const control = $('pricing-manage');
  const original = control.textContent;
  control.disabled = true;
  control.textContent = 'Opening Paddle portal...';
  try {
    const portal = await billingRequest('/api/paddle/portal', 'POST');
    location.assign(portal.url);
  } catch (error) {
    $('pricing-status').classList.add('is-error');
    $('pricing-status').textContent = errorMessage(error);
    control.disabled = false;
    control.textContent = original;
  }
};

async function signOut() {
  const { error } = await cloud.auth.signOut();
  if (error) { status(error.message); return; }
  user = null; guestMode = false; sessionStorage.removeItem('dusk-guest');
  $('billing-dialog').close(); navigate('/', true); await refresh();
}

$('billing-signout').onclick = signOut;
$('account-password').onclick = () => { $('billing-dialog').close(); showAuth('update'); };

async function refresh() {
  if (currentRoute() === '/' && (user || guestMode)) navigate('/home', true);
  const route = currentRoute();
  const showingPricing = route === '/pricing';
  const showingSubscriptionWelcome = route === '/welcome';
  const request = ++libraryRequest;
  const libraryOwner = owner();
  let cached = [];
  $('pricing-nav-link').hidden = showingPricing;
  $('account').textContent = user ? 'Account' : 'Sign in';
  $('welcome').hidden=showingPricing||showingSubscriptionWelcome||Boolean(user)||guestMode;
  $('subscription-welcome').hidden=!showingSubscriptionWelcome;
  $('library').hidden=showingPricing||showingSubscriptionWelcome||Boolean(active)||(!user&&!guestMode);
  if(showingPricing){await pricingPage.show();return;}
  pricingPage.hide();
  if(showingSubscriptionWelcome){confirmProvisioning();return;}
  if(renderedOwner!==libraryOwner){projects=[];renderedOwner=libraryOwner;render();}
  $('storage-label').textContent = user ? 'YOUR CLOUD LIBRARY' : 'THIS BROWSER';
  $('storage-caption').textContent=user?'Your personal cloud library':'A library on this device';
  $('nav-inbox').hidden=!user;
  if (!user && libraryView === 'inbox') libraryView='projects';
  $('storage-info').textContent = user ? `Signed in as ${user.email}. Cloud books and progress are private to your account. Local projects stay in your browser library.` : 'Saved in this browser, including the original EPUB. Clearing site data removes local projects. Sign in for a cloud library.';
  if(user)status('Refreshing your account library...');
  setLoading(true, 'Refreshing library…');
  try {
    cached=await local.list(libraryOwner);
    const result=user?await remote.list():cached;
    const pendingInvitations=user?await remote.inbox().catch(()=>[]):[];
    if(request !== libraryRequest || libraryOwner !== owner()) return;
    projects=user?[...cached.filter(p=>p.storage==='local'),...result.map(p=>{
      const draft=cached.find(c=>c.id===p.id);
      return draft?.dirty?draft:draft?.revision===p.revision?{...p,snapshot:draft.snapshot}:p;
    })]:result;
    invitations=pendingInvitations;
    status('');render();
    setLoading(false);
  }catch(e){
    if(request !== libraryRequest || libraryOwner !== owner())return;
    projects=cached;
    render();status(`${errorMessage(e)}${projects.length?' Showing projects cached on this device.':''}`);
    setLoading(false);
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
    if(user&&p.owner!=='guest'&&['owner','editor'].includes(role))actions.append(button('Public reader link',()=>showReaderLinkDialog({project:p,remote,upgrade:()=>showUpgrade({feature:'Public reader links',required:'Teams'})})));
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
  $('new-storage-label').hidden=!user;
  $('new-title').required = !importing;
  $('new-file-label').firstChild.textContent = importing ? 'DuskTranslate project ZIP' : 'Original book or project backup';
  $('new-file').accept = importing ? '.zip,application/zip' : '.epub,.json,.txt,.zip';
  $('new-file-help').innerHTML = importing
    ? 'Choose a project ZIP exported by DuskTranslate. It restores the original book, translations, glossary, and reading position.'
    : 'EPUB, source JSON, TXT, or backup ZIP · up to 50 MB.<br>Your original file is kept for future exports.';
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
    let snapshot = null, importedTitle = '', importedStorage='', importedDocument=null, importedImages=[];
    if (/\.zip$/i.test(file.name)) {
      const {default:JSZip} = await import('jszip');
      const archive = await JSZip.loadAsync(file);
      if (Object.values(archive.files).reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>500*1024*1024) throw new Error('Expanded backup exceeds 500 MB.');
      if (!archive.file('project.json')) throw new Error('This ZIP is not a DuskTranslate project backup.');
      const record = JSON.parse(await archive.file('project.json').async('string'));
      if (typeof record.fileName!=='string' || !/\.(epub|json|txt)$/i.test(record.fileName) || !archive.file(record.fileName.replace(/[\\/]/g,'_'))) throw new Error('Backup original book is missing or invalid.');
      snapshot=cleanSnapshot(record.snapshot);
      importedStorage=record.storage==='local'?'local':'';
      if(typeof record.localDocument==='string')importedDocument=Uint8Array.from(atob(record.localDocument),character=>character.charCodeAt(0));
      for(const image of Array.isArray(record.localImages)?record.localImages:[]){const entry=archive.file(image.file);if(entry)importedImages.push({...image,blob:new Blob([await entry.async('arraybuffer')],{type:image.mime})});}
      importedTitle=typeof record.title === 'string' ? record.title.trim().slice(0,120) : '';
      file=new File([await archive.file(record.fileName.replace(/[\\/]/g,'_')).async('arraybuffer')],record.fileName);
      validateFile(file);
    }
    const title = (importingProject ? importedTitle : $('new-title').value.trim()) || $('new-title').value.trim();
    if (!title) throw new Error(importingProject ? 'This backup does not include a usable project title.' : 'Enter a project title.');
    const localOnly=!user||$('new-local').checked||importedStorage==='local';
    let p = { id:crypto.randomUUID(), owner:owner(), storage:localOnly?'local':'cloud', title, file, fileName:file.name, snapshot, localDocument:importedDocument, archived:false, revision:1, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), dirty:false };
    if (user&&!localOnly) p = await remote.create(p);
    for(const image of importedImages)await local.putImage(p.id,image.epubPath,image.blob,{bytes:image.bytes,mime:image.mime,width:image.width,height:image.height});
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
  if (!user||cached?.storage==='local') return cached;
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
  setLoading(true, 'Opening project…');
  try {
    await acquire(id); status('Opening your book…');
    active = await loadProject(id);
    if (!active) throw new Error('Project not found. Refresh your library.');
    active.accessRole = active.owner === owner() ? 'owner' : active.collaborators?.find(member => member.user_id === user?.id)?.role || 'viewer';
    const rights=await currentEntitlements(active);
    if(rights.editable===false)active.accessRole='viewer';
    generation = active.dirty ? 1 : 0; persisted=0; saveError=''; streaming=false; editorReady=false;
    $('library').hidden=true; $('workspace').hidden=false; document.body.classList.add('workspace-open');
    $('project-title').textContent=active.title; announceSave('Opening…');
    // A hard reload can miss the editor's ready message; load is a reliable second handshake.
    $('editor').onload = () => setTimeout(openActiveEditorProject, 0);
    $('editor').src='/editor/index.html'; status('');
    if (updateRoute) navigate(projectRoute('/editor', id));
  } catch(e) { status(errorMessage(e)); active=null; releaseLock?.(); releaseLock=null; }
  finally { opening=false; setLoading(false); }
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
async function renderReader() {
  if (!readerBook) return;
  const renderGeneration=++readerRenderGeneration;
  const chapter = readerBook.chapters[readerChapter];
  if(sharedReaderToken){
    $('reader-content').replaceChildren();
    try{await remote.readerComments(sharedReaderToken,chapter.id);}
    catch(error){$('reader-status').textContent=errorMessage(error);publicComments.close();return;}
    if(renderGeneration!==readerRenderGeneration||!readerBook)return;
  }
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
    return renderRubyParagraph(block);
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
  if(sharedReaderToken)await publicComments.open(sharedReaderToken,chapter.id);
  else publicComments.close();
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
  setLoading(true, 'Preparing reader…');
  try {
    readerBook = await readEpub(file, fileName); await renderReader();
    $('reader-editor').hidden = !project;
    $('reader-status').textContent = 'Ready to read';
    $('reader-page').focus({ preventScroll: true });
  } catch (error) {
    $('reader-chapter-title').textContent = 'This EPUB could not be opened.';
    $('reader-status').textContent = 'Reader error';
    $('reader-content').append(el('p', '', errorMessage(error)));
  } finally { setLoading(false); }
}
async function openReader(id, edition = 'original', updateRoute = true) {
  if (active || readerOpen || opening) return;
  opening = true;
  setLoading(true, 'Opening EPUB…');
  status('Opening EPUB reader...');
  try {
    const project = await loadProject(id);
    if (!project?.file || !isEpub(project)) throw new Error('This project does not contain an EPUB file.');
    const projectFile=await projectFileWithReplacements(project);
    const file = edition === 'translated' ? await buildTranslatedEpub(projectFile, project.snapshot) : projectFile;
    await presentReader(file, project.fileName, edition === 'translated' ? 'TRANSLATED EDITION' : 'ORIGINAL EDITION', project);
    if (updateRoute) navigate(projectRoute('/reader', id, edition));
    status('');
  } catch (error) {
    status(errorMessage(error));
  } finally { opening = false; setLoading(false); }
}
async function openSharedReader(token) {
  if (active || readerOpen || opening) return;
  opening = true;
  setLoading(true, 'Opening shared reader…');
  try {
    sharedReaderToken=token;
    const project=await remote.openPublicReader(token);
    if (!project.file || !isEpub(project)) throw new Error('This shared project does not contain an EPUB file.');
    let file=project.file, edition='SHARED ORIGINAL EDITION';
    try { file=await buildTranslatedEpub(project.file, project.snapshot); edition='SHARED TRANSLATED EDITION'; }
    catch { /* An in-progress project remains readable from its original EPUB. */ }
    await presentReader(file, project.fileName, edition);
  } catch (error) {
    prepareReader('Shared EPUB', 'SHARED EDITION');
    $('reader-chapter-title').textContent='This reader link is unavailable.';
    $('reader-status').textContent='Reader error';
    $('reader-content').append(el('p', '', errorMessage(error)));
  } finally { opening = false; setLoading(false); }
}
function leaveReader({ updateRoute = true } = {}) {
  if (!readerOpen) return;
  sharedReaderToken=null;readerRenderGeneration++;publicComments.close();
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
let pendingCollaborativeEdits = [];

function queueCollaborativeTranslations(snapshot) {
  if (!active || !isCloud() || active.accessRole === 'viewer') return;
  const edits=(snapshot.novel?.chapters || []).map(chapter=>({
    projectId:active.id,
    chapterId:chapter.id,
    value:String(snapshot.translations?.[chapter.id] || '').replace(/…PARTIAL$/u,'')
  }));
  if(projectCollaboration){
    for(const edit of edits)projectCollaboration.edit(edit.chapterId,edit.value);
  }else{
    const latest=new Map(pendingCollaborativeEdits.filter(edit=>edit.projectId===active.id).map(edit=>[edit.chapterId,edit]));
    for(const edit of edits)latest.set(edit.chapterId,edit);
    pendingCollaborativeEdits=[...pendingCollaborativeEdits.filter(edit=>edit.projectId!==active.id),...latest.values()];
  }
}
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
window.addEventListener('message', async e => {
  if (e.origin !== location.origin || e.source !== $('editor').contentWindow || !active) return;
  if (e.data.type==='editor:launch' && e.data.projectId===active.id) {
    const frame=e.source;
    launchRequest(e.data).then(result=>frame.postMessage({type:'host:launch',requestId:e.data.requestId,result},location.origin))
      .catch(error=>frame.postMessage({type:'host:launch',requestId:e.data.requestId,error:error.message},location.origin));
    return;
  }
  if (e.data.type === 'editor:presence-location' && e.data.projectId === active.id) {
    projectPresence?.update(e.data.location);
    if(typeof e.data.location?.chapterId==='string')sendRuby(e.data.location.chapterId);
    return;
  }
  if(e.data.type==='editor:text-edit'&&e.data.projectId===active.id){
    if(typeof e.data.chapterId==='string'&&typeof e.data.value==='string'){
      const edit={projectId:active.id,chapterId:e.data.chapterId,value:e.data.value};
      if(projectCollaboration)projectCollaboration.edit(edit.chapterId,edit.value);
      else pendingCollaborativeEdits.push(edit);
    }
    return;
  }
  if (e.data.type === 'editor:findNavigate') {
    focusFindMatch(findReplaceIndex + Number(e.data.delta || 0));
    return;
  }
  if (e.data.type === 'editor:action') {
    const gated={ruby:'rubyEdit',rubyUpgrade:'rubyEdit',removeRuby:'rubyEdit',updateRuby:'rubyEdit',exportSettings:'exportSelection',consistency:'consistency',consistencyReview:'consistency',customPrompt:'customPrompt'};
    if(gated[e.data.action] && !await requireFeature(gated[e.data.action]))return;
    if (e.data.action === 'comments' && e.data.projectId === active.id) comments.open(e.data.selection);
    if (e.data.action === 'ruby' && e.data.projectId === active.id) openRuby(e.data.selection);
    if (e.data.action === 'images' && e.data.projectId === active.id) showImages();
    if (e.data.action === 'exportEpub' && e.data.projectId === active.id) exportTranslatedEpub();
    if (['removeRuby','updateRuby'].includes(e.data.action) && e.data.projectId===active.id && active.accessRole!=='viewer' && typeof e.data.rubyId==='string' && projectCollaboration) {
      try{if(e.data.action==='updateRuby')projectCollaboration.updateRuby(e.data.rubyId,e.data.reading);else projectCollaboration.removeRuby(e.data.rubyId);}
      catch(error){announceSave(errorMessage(error));}
    }
    if (e.data.action === 'library') leave();
    if (e.data.action === 'save') saveNow();
    if (e.data.action === 'backup') downloadBackup();
    if (e.data.action === 'exportSettings') showExportSettings();
    if (e.data.action === 'findReplace') showFindReplace();
    if (e.data.action === 'findReview') showFindReplace(true);
    if (e.data.action === 'consistency') checkConsistency();
    if (e.data.action === 'consistencyReview') checkConsistency();
    if (e.data.action === 'customPrompt') showCustomInstructions();
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
    void refreshQuotaMeter();
    comments.watch(active).catch(error=>announceSave(`Comments unavailable: ${errorMessage(error)}`));
    projectPresence?.stop(); projectPresence=null;
    if (user && isCloud()) {
      const id=active.id;
      projectPresence=startProjectPresence(cloud,id,user.id,presence=>{
        if (active?.id === id) $('editor').contentWindow?.postMessage({type:'host:presence',...presence},location.origin);
      });
      if(active.accessRole!=='viewer'){
        projectCollaboration?.stop();projectCollaboration=null;
        const project=active;
        startCollaboration({project,local,remote,onStatus:message=>{if(active===project)announceSave(message);},onRuby:(chapterId)=>{if(active===project)sendRuby(chapterId);},onText:(chapterId,value)=>{
          if(active!==project)return;
          const previous=active.snapshot.translations?.[chapterId]||'';
          if(previous===value)return;
          active.snapshot.translations ||= {};
          if(value)active.snapshot.translations[chapterId]=value;else delete active.snapshot.translations[chapterId];
          $('editor').contentWindow?.postMessage({type:'host:sharedText',projectId:active.id,chapterId,value},location.origin);
          generation++;active.dirty=true;
          const draft={...active,updatedAt:new Date().toISOString()};
          draftQueue=draftQueue.catch(()=>{}).then(()=>local.patch(draft)).catch(error=>announceSave(`Could not save local draft: ${errorMessage(error)}`));
          if(!saveTimer)saveTimer=setTimeout(async()=>{saveTimer=null;await draftQueue;await flush();},1200);
        }}).then(controller=>{
          if(active!==project){controller.stop();return;}
          projectCollaboration=controller;
          for(const chapter of project.snapshot.novel.chapters)sendRuby(chapter.id);
          const queued=pendingCollaborativeEdits.filter(edit=>edit.projectId===project.id);
          pendingCollaborativeEdits=pendingCollaborativeEdits.filter(edit=>edit.projectId!==project.id);
          for(const edit of queued)controller.edit(edit.chapterId,edit.value);
        }).catch(error=>{if(active===project)announceSave(`Collaboration unavailable: ${errorMessage(error)}`);});
      }
    } else if(user&&!isCloud()&&active.accessRole!=='viewer') {
      projectCollaboration?.stop();
      const project=active;
      projectCollaboration=startLocalDocument({project,onRuby:chapterId=>{if(active===project)sendRuby(chapterId);},onText:(chapterId,value)=>{
        if(active!==project)return;
        active.snapshot.translations ||= {};
        if(value)active.snapshot.translations[chapterId]=value;else delete active.snapshot.translations[chapterId];
        $('editor').contentWindow?.postMessage({type:'host:sharedText',projectId:active.id,chapterId,value},location.origin);
      },onPersist:async bytes=>{
        if(active!==project)return;
        project.localDocument=bytes;generation++;
        await local.patch({...project,updatedAt:new Date().toISOString()});
      }});
      for(const chapter of project.snapshot.novel.chapters)sendRuby(chapter.id);
    }
  }
  if (e.data.type !== 'editor:state') return;
  try {
    const next=cleanSnapshot(e.data.snapshot);
    queueCollaborativeTranslations(next);
    if(projectCollaboration){
      next.translations ||= {};
      for(const chapter of next.novel?.chapters || []){
        const value=projectCollaboration.text(chapter.id);
        if(value)next.translations[chapter.id]=value;else delete next.translations[chapter.id];
      }
    }
    active.snapshot=next; generation++;
    streaming=Boolean(e.data.busy); $('back').disabled=streaming;
    active.dirty=isCloud();
    const draft={...active,updatedAt:new Date().toISOString()};
    // Preserve edits promptly even if cloud writes fail or the network disappears.
    draftQueue=draftQueue.catch(()=>{}).then(()=>local.patch(draft)).catch(err=>{saveError=errorMessage(err);announceSave(saveError);});
    announceSave(streaming?'Translating; saving partial progress…':'Unsaved changes…');
    if (!saveTimer) saveTimer=setTimeout(async()=>{saveTimer=null;await draftQueue;await flush();},1200);
  } catch(err) { announceSave(errorMessage(err)); }
});
async function saveNow() { saveError=''; await projectCollaboration?.flush();await draftQueue; await flush(); }
$('save-now').onclick = saveNow;
async function leave({ updateRoute = true } = {}) {
  if (!active || streaming || closing) return;
  closing=true; clearTimeout(saveTimer); saveTimer=null;
  await projectCollaboration?.flush();await draftQueue; saveError=''; await flush();
  if (saveError) {
    const cached=await local.get(owner(),active.id);
    const safe=cached&&JSON.stringify(cached.snapshot)===JSON.stringify(cleanSnapshot(active.snapshot));
    if(!safe||!window.confirm('Cloud sync is incomplete, but your latest draft is saved on this device. Return to the library and retry later?')){closing=false;return;}
  }
  projectPresence?.stop(); projectPresence=null;projectCollaboration?.stop();projectCollaboration=null;
  pendingCollaborativeEdits=pendingCollaborativeEdits.filter(edit=>edit.projectId!==active.id);
  comments.stop();
  $('editor').src='about:blank'; active=null; editorReady=false; $('workspace').hidden=true; $('library').hidden=false; document.body.classList.remove('workspace-open'); releaseLock?.(); releaseLock=null; closing=false; await refresh(); $('search').focus();
  if (updateRoute) navigate('/home');
}
$('back').onclick=leave;
$('brand').onclick=e=>{
  if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  e.preventDefault();
  if(active){leave();return;}
  if(readerOpen){leaveReader();return;}
  if(!user){guestMode=false;sessionStorage.removeItem('dusk-guest');}
  navigate(user?'/home':'/');
  refresh();
};
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
  const localImages=!isCloud(project)?await local.imageAssets(project.id):[];
  const imageManifest=[];
  for(const [index,image] of localImages.entries()){
    const file=`local-images/${index}`;zip.file(file,image.replacement);imageManifest.push({file,epubPath:image.epub_path,bytes:image.bytes,mime:image.mime,width:image.width,height:image.height});
  }
  const localDocument=project.localDocument instanceof Uint8Array?bytesToBase64(project.localDocument):null;
  zip.file(originalName,project.file);
  zip.file('project.json',JSON.stringify({schemaVersion:3,exportedAt:new Date().toISOString(),title:project.title,fileName:project.fileName,storage:project.storage,snapshot,localDocument,localImages:imageManifest},null,2));
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
window.addEventListener('pagehide',()=>{projectPresence?.stop();projectPresence=null;projectCollaboration?.stop();projectCollaboration=null;});
window.addEventListener('online',()=>{if(active){saveError='';flush();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});

let sharingProject = null;
function formatStorage(bytes) {
  const units=['B','KB','MB','GB','TB'];
  let value=Number(bytes)||0,unit=0;
  while(value>=1000&&unit<units.length-1){value/=1000;unit+=1;}
  const rounded=unit===0||value>=100?Math.round(value):Number(value.toFixed(1));
  return `${rounded} ${units[unit]}`;
}
const capacityButton=button('Manage editable projects',async()=>{
  try{
    const data=await remote.capacity();
    const allowance=data.limits.projects;
    const projectCount=data.projects.length;
    const projectSummary=projectCount<=allowance
      ? `All ${projectCount} of your projects currently fit within your ${allowance} editable project slots.`
      : `You have ${allowance} editable project slots for ${projectCount} projects.`;
    showCapacitySelection({title:'Manage editable projects',description:`${projectSummary} When you reach the limit, checked projects are prioritized first and older projects fill any remaining slots. Projects without a slot remain available for reading and export, but edits cannot be saved. Archived projects count toward the project limit. Cloud storage: ${formatStorage(data.storageBytes)} used of ${formatStorage(data.limits.storageBytes)}.`,entries:data.projects,allowance,
      save:async ids=>{await remote.selectProjects(ids);await refresh();}});
  }catch(error){$('billing-detail').textContent=errorMessage(error);}
});
capacityButton.type='button';$('billing-detail').after(capacityButton);
const seatButton=button('Choose active collaborators',async()=>{
  if(!sharingProject)return;const project=sharingProject;
  try{
    const data=await remote.seatSelection(project.id);
    showCapacitySelection({title:'Choose active collaborators',description:'Your own seat is included separately. Unselected members beyond capacity are suspended, not deleted. Spare slots fill with the earliest accepted members.',entries:data.members,allowance:data.allowance,
      save:async ids=>{await remote.configureLaunch(project.id,ids);await renderShareMembers();}});
  }catch(error){$('share-error').textContent=errorMessage(error);}
});
seatButton.type='button';$('share-members').before(seatButton);
const readerCommentLabel=document.createElement('label'),readerCommentToggle=document.createElement('input');
readerCommentToggle.type='checkbox';readerCommentToggle.id='share-reader-comments';
readerCommentLabel.append(readerCommentToggle,document.createTextNode(' Allow signed-in readers to comment (Teams)'));
$('share-reader-actions').after(readerCommentLabel);readerCommentLabel.hidden=true;
readerCommentToggle.onchange=async()=>{
  if(!sharingProject)return;
  readerCommentToggle.disabled=true;
  try{await remote.setReaderCommenting(sharingProject.id,readerCommentToggle.checked);}
  catch(error){readerCommentToggle.checked=!readerCommentToggle.checked;$('share-error').textContent=errorMessage(error);}
  finally{readerCommentToggle.disabled=false;}
};
function publicReaderUrl(token) { return `${location.origin}/reader?share=${encodeURIComponent(token)}`; }
function renderPublicReaderLink(token) {
  const url=$('share-reader-url'), enable=$('share-reader-enable'), copy=$('share-reader-copy'), disable=$('share-reader-disable');
  const active=Boolean(token); url.value=active?publicReaderUrl(token):'';
  readerCommentLabel.hidden=!active;readerCommentToggle.checked=false;
  if(token)remote.readerComments(token,'').then(data=>{if(url.value===publicReaderUrl(token))readerCommentToggle.checked=data.enabled;}).catch(error=>{$('share-error').textContent=errorMessage(error);});
  url.hidden=!active; copy.hidden=!active; disable.hidden=!active; enable.hidden=active;
}
async function refreshPublicReaderLink() {
  if (!sharingProject) return;
  renderPublicReaderLink(await remote.publicReaderLink(sharingProject.id));
}
$('share-reader-enable').onclick=async()=>{
  if (!sharingProject) return;
  $('share-reader-enable').disabled=true; $('share-error').textContent='';
  try { renderPublicReaderLink(await remote.enablePublicReaderLink(sharingProject.id)); }
  catch(error){$('share-error').textContent=errorMessage(error);}
  finally {$('share-reader-enable').disabled=false;}
};
$('share-reader-copy').onclick=async()=>{
  try { await navigator.clipboard.writeText($('share-reader-url').value); $('share-reader-copy').textContent='Copied'; setTimeout(()=>$('share-reader-copy').textContent='Copy link',1500); }
  catch { $('share-reader-url').focus(); $('share-reader-url').select(); document.execCommand('copy'); }
};
$('share-reader-disable').onclick=async()=>{
  if (!sharingProject) return;
  $('share-reader-disable').disabled=true; $('share-error').textContent='';
  try { await remote.disablePublicReaderLink(sharingProject.id); renderPublicReaderLink(null); }
  catch(error){$('share-error').textContent=errorMessage(error);}
  finally {$('share-reader-disable').disabled=false;}
};
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
  renderPublicReaderLink(null);
  $('share-dialog').showModal();
  try { await Promise.all([renderShareMembers(),refreshPublicReaderLink()]); } catch (error) { $('share-error').textContent = errorMessage(error); }
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
  $('consent-row').hidden=mode!=='signup';
  $('terms-accept').checked=false;
  $('terms-accept').required=mode==='signup';
  resetGoogleButton();
  $('auth-info').textContent=cloud?'Use Google or your email and password. AI-provider keys are separate and never saved with your account.':'Cloud accounts are not configured on this deployment yet. Your browser library works now; account sign-in will be enabled when the project owner connects Supabase.';
  setAuthBusy(false);
  if(!$('auth-dialog').open)$('auth-dialog').showModal();
  if(mode==='signin'||mode==='signup')prepareGoogleButton();
}
function setAuthBusy(busy) {
  authBusy=busy;
  $('auth-form').setAttribute('aria-busy',String(busy));
  $('auth-submit').disabled=busy||!cloud;
  ['auth-switch','forgot'].forEach(id=>$(id).disabled=busy);
}
let googleRenderVersion=0;
function resetGoogleButton(label='Loading Google sign-in...') {
  googleRenderVersion++;
  const placeholder=document.createElement('button');
  placeholder.type='button';placeholder.id='google-auth-placeholder';placeholder.disabled=true;placeholder.textContent=label;
  $('google-auth').replaceChildren(placeholder);
}
async function prepareGoogleButton() {
  if(!cloud)return resetGoogleButton('Google sign-in unavailable');
  const version=++googleRenderVersion;
  resetGoogleButton('Loading Google sign-in...');
  try{
    if(!await googleAvailable())throw new Error('Google sign-in is not enabled yet. You can use email now; the project owner still needs to connect Google in Supabase.');
    if(version+1!==googleRenderVersion)return;
    await renderGoogleCredentialButton($('google-auth'),async credential=>{
      if(!credential||authBusy)return;
      authStorage.choose($('remember-me').checked);setAuthBusy(true);$('auth-message').textContent='Signing in with Google...';
      try{
        const {data,error}=await cloud.auth.signInWithIdToken({provider:'google',...credential});
        if(error)throw error;
        user=data.user||user;
        if($('auth-dialog').open)$('auth-dialog').close();
        setAuthBusy(false);await refresh();
      }catch(error){setAuthBusy(false);$('auth-message').textContent=errorMessage(error);prepareGoogleButton();}
    });
  }catch(error){
    if(version+1===googleRenderVersion){resetGoogleButton('Google sign-in unavailable');$('auth-message').textContent=errorMessage(error);}
  }
}
$('terms-accept').onchange=()=>{
  $('auth-message').textContent='';
};
// A browser Back navigation may restore the page while the OAuth button is busy.
window.addEventListener('pageshow',()=>setAuthBusy(false));
$('account').onclick=()=>user?showBilling():showAuth();
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
      comments.stop();
      projectPresence?.stop();projectPresence=null;projectCollaboration?.stop();projectCollaboration=null;
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
  const route = currentRoute(), parameters = new URLSearchParams(location.search), projectId = parameters.get('project'), sharedToken = parameters.get('share');
  if (route === '/' && (user || guestMode)) { navigate('/home', true); return; }
  if (route === '/reader' && sharedToken) { await openSharedReader(sharedToken); return; }
  if (!user && !guestMode && !['/','/pricing','/welcome'].includes(route)) { navigate('/', true); await refresh(); return; }
  if (route === '/pricing' || route === '/welcome') return;
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
  else { await restoreRoute(); await refresh(); }
});
await restoreRoute();
if(authError){showAuth();$('auth-message').textContent=authError;}
