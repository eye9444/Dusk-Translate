/* Classic script intentionally shares the standalone editor's lexical state. */
let projectId = null;
let readyForSave = false;
let projectOpenPing = null;
let lastSnapshot = '';
let lastBusy = false;
let lastBulkReplacement = null;
let exportExcluded = [];
let canEdit = true;
let cloudProject = false;
globalThis.DuskCapabilities = {};
let quotaMeterState=null;
function renderQuotaMeter() {
  if(!quotaMeterState)return;
  let meter=document.getElementById('host-quota-meter');
  if(!meter){
    meter=document.createElement('span');meter.id='host-quota-meter';
    meter.style.cssText='font-size:11px;line-height:1.4;white-space:normal;color:inherit;';
    document.getElementById('btn-tl').parentElement.append(meter);
  }
  const q=quotaMeterState;
  if(q.local){meter.textContent='Local: no daily app limit';return;}
  if(q.readOnly){meter.textContent='Read-only project';return;}
  if(q.unavailable){meter.textContent='Usage unavailable - retry before translating';return;}
  if(q.unlimited){meter.textContent='Cloud: no daily app limit';return;}
  const seconds=Math.max(0,Math.ceil((Date.parse(q.resetAt)-Date.now())/1000));
  const countdown=`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;
  meter.textContent=`${Number(q.completed||0).toLocaleString()} / 30,000 today`+
    (q.reserved ? ` (${Number(q.reserved).toLocaleString()} reserved)` : '')+
    ` - ${Number(q.remaining||0).toLocaleString()} remaining - resets in ${countdown}`;
  meter.title=`Daily allowance resets at ${new Date(q.resetAt).toLocaleString()} (00:00 UTC). Provider charges are separate.`;
}
setInterval(renderQuotaMeter,5000);
function setEntitlements(rights = {tier:'free',capabilities:{}}) {
  globalThis.DuskCapabilities = rights.capabilities || {};
  globalThis.DuskCustomInstructions = rights.capabilities?.customPrompt ? rights.customInstructions || '' : '';
  const importButton=document.getElementById('btn-import');
  if(importButton)importButton.hidden=cloudProject && rights.tier==='free';
  globalThis.DuskCanImportTranslation=!cloudProject || rights.tier!=='free';
  for(const [id,feature,label,required] of [
    ['host-consistency','consistency','Check consistency','Pro'],
    ['host-export-settings','exportSelection','Choose exported chapters','Pro'],
    ['host-custom-prompt','customPrompt','Translation instructions','Teams'],
    ['host-ruby','rubyEdit','Ruby text','Pro'],
    ['host-selection-ruby','rubyEdit','Ruby','Pro'],
  ]){
    const button=document.getElementById(id);if(!button)continue;
    button.textContent=label;
    if(!rights.capabilities?.[feature]){
      const crown=document.createElement('span');
      crown.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l5 5 4-7 4 7 5-5-2 13H5z" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
      crown.append(document.createTextNode(' '+required));crown.style.marginLeft='8px';button.append(crown);
    }
  }
}
const send = (type, extra = {}) => parent.postMessage({ type, projectId, ...extra }, location.origin);
let spellcheckEnabled = true;
function setAccess(role = 'owner') {
  canEdit = role !== 'viewer';
  document.body.classList.toggle('view-only', !canEdit);
  document.getElementById('tl-out').contentEditable = canEdit && !busy ? 'true' : 'false';
  ['api-key','model-select','model-import','style-sel','glossary','btn-tl','btn-abort','btn-import','btn-retry','btn-clear'].forEach(id => {
    const control = document.getElementById(id);
    if (control) control.disabled = !canEdit;
  });
  const status = document.getElementById('key-status');
  if (!canEdit) { status.textContent = 'Viewer access - read only'; status.className = 'key-status'; }
}
function snapshot() {
  const saved = { ...translations };
  if (busy && novel) {
    const text = Array.from(document.getElementById('tl-out').childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('');
    if (text) saved[novel.chapters[cur].id] = text + '…PARTIAL';
  }
  return { novel, translations: saved, partialResumes, exportExcluded, cur, glossary: document.getElementById('glossary').value, model: getModelVal(), style: document.getElementById('style-sel').value, spellcheck: spellcheckEnabled };
}
function emit(force = false) {
  const libraryButton = document.getElementById('host-library');
  if (libraryButton) libraryButton.disabled = busy;
  if (!canEdit || !readyForSave || !novel) return;
  const state = snapshot();
  const encoded = JSON.stringify(state);
  if (force || encoded !== lastSnapshot || lastBusy !== busy) {
    lastSnapshot = encoded; lastBusy = busy;
    send('editor:state', { snapshot: state, busy });
  }
}
function saveManualText() {
  if (busy || !novel) return;
  const out = document.getElementById('tl-out').cloneNode(true);
  out.querySelectorAll('.partial-badge,.cursor').forEach(n => n.remove());
  const value = out.textContent;
  const id = novel.chapters[cur].id;
  if (value.trim()) translations[id] = value;
  else delete translations[id];
  delete partialResumes[id];
  send('editor:text-edit',{chapterId:id,value});
  updateMark(cur, value); updateProg(); emit();
}

function restoreCaret(root,offset){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let remaining=offset,node;
  while((node=walker.nextNode())){if(remaining<=node.textContent.length){const range=document.createRange();range.setStart(node,remaining);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return;}remaining-=node.textContent.length;}
}
const clearSearchHighlights = () => {
  if (findNavigator) findNavigator.hidden = true;
  if (!globalThis.CSS?.highlights) return;
  CSS.highlights.delete('dusk-find');
  CSS.highlights.delete('dusk-find-current');
};
function textRange(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0, startNode, endNode, startOffset, endOffset;
  while (walker.nextNode()) {
    const node = walker.currentNode, nodeEnd = offset + node.textContent.length;
    if (!startNode && start >= offset && start <= nodeEnd) { startNode = node; startOffset = start - offset; }
    if (end >= offset && end <= nodeEnd) { endNode = node; endOffset = end - offset; break; }
    offset = nodeEnd;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange(); range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset); return range;
}
function createFindRegex(findText, caseSensitive, matchMode = 'substring') {
  const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match only complete Unicode words when requested, without changing substring search.
  const pattern = matchMode === 'word' ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  return new RegExp(pattern, caseSensitive ? 'gu' : 'giu');
}
function highlightSearchMatch({ findText, caseSensitive, matchMode, matchIndex, target = 'translation' }) {
  clearSearchHighlights();
  if (!findText) return;
  const root = target === 'source' ? document.getElementById('src-txt') : document.getElementById('tl-out');
  const regex = createFindRegex(findText, caseSensitive, matchMode);
  const matches = [];
  for (const match of root.textContent.matchAll(regex)) {
    const range = textRange(root, match.index, match.index + match[0].length);
    if (range) matches.push({ range, index: match.index });
  }
  if (!matches.length) return;
  const current = matches.find(match => match.index === matchIndex) || matches[0];
  // Navigate to the match without changing the document's visual text styling.
  const rootBox = root.getBoundingClientRect(), matchBox = current.range.getBoundingClientRect();
  root.scrollTop += matchBox.top - rootBox.top - (root.clientHeight / 2) + (matchBox.height / 2);
}
document.getElementById('tl-out').addEventListener('input', () => { clearSearchHighlights(); saveManualText(); });
document.getElementById('tl-out').addEventListener('paste', e => {
  e.preventDefault(); if (busy) return;
  if (!canEdit) return;
  const text = e.clipboardData.getData('text/plain');
  const selection = getSelection();
  if (selection.rangeCount) {
    const range = selection.getRangeAt(0); range.deleteContents();
    const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range); saveManualText();
  }
});
document.getElementById('glossary').addEventListener('input', () => emit());
document.getElementById('style-sel').addEventListener('change', () => emit());
document.getElementById('model-select').addEventListener('change', () => emit());
const keyInput = document.getElementById('api-key');
keyInput.type = 'password'; keyInput.autocomplete = 'off'; hidden = true;
toggleVis = function () { hidden = !hidden; keyInput.type = hidden ? 'password' : 'text'; document.getElementById('vis-btn').setAttribute('aria-label', hidden ? 'Show API key' : 'Hide API key'); };
document.getElementById('vis-btn').setAttribute('aria-label', 'Show API key');
document.getElementById('api-key').setAttribute('aria-label','AI provider API key');
document.getElementById('model-select').setAttribute('aria-label','AI provider model');
document.getElementById('style-sel').setAttribute('aria-label','Translation style');
document.getElementById('src-txt').setAttribute('aria-label','Source text');
document.getElementById('tl-out').setAttribute('aria-label','Editable translation');
document.getElementById('glossary').setAttribute('aria-label','Glossary');
document.getElementById('btn-tl').setAttribute('aria-label','Translate current chapter');
document.getElementById('btn-prev').setAttribute('aria-label','Previous chapter');
document.getElementById('btn-next').setAttribute('aria-label','Next chapter');

const keyBar = document.querySelector('.key-bar');
const makeDisclosure = (label, className) => {
  const details = document.createElement('details'); details.className = `mobile-disclosure ${className}`;
  const summary = document.createElement('summary'); summary.textContent = label;
  const content = document.createElement('div'); content.className = 'mobile-disclosure-content';
  details.append(summary, content); return { details, content };
};
const [keyLabel, keyInputWrap, modelLabel, modelPicker, keyStatus] = Array.from(keyBar.children);
const modelSelect = modelPicker.querySelector('#model-select');
keyLabel.htmlFor='api-key'; modelLabel.htmlFor='model-select'; keyStatus.setAttribute('role','status');
const providerField = (className, label, control) => {
  const field=document.createElement('div'); field.className=`provider-field ${className}`; field.append(label,control); return field;
};
const providerDisclosure = makeDisclosure('AI provider & model', 'provider-disclosure');
const keyGuide = document.createElement('a'); keyGuide.className='api-key-guide'; keyGuide.href='/guides/api-keys.html'; keyGuide.target='_blank'; keyGuide.rel='noopener'; keyGuide.textContent='Get an API key ↗';
const providerFeedback=document.createElement('div'); providerFeedback.className='provider-feedback'; providerFeedback.append(keyStatus,keyGuide);
const providerControls=document.createElement('div'); providerControls.className='provider-controls';
providerControls.append(providerField('provider-key-field',keyLabel,keyInputWrap),providerField('provider-model-field',modelLabel,modelPicker),providerFeedback);
providerDisclosure.content.append(providerControls);
keyBar.append(providerDisclosure.details);

// Yomitan reads ordinary selectable page text, so the source pane remains real
// Japanese DOM text rather than a canvas or custom rendering surface.
const sourceText=document.getElementById('src-txt');
sourceText.lang='ja';sourceText.setAttribute('translate','no');
const showDictionary=()=>send('editor:dictionary');

const editorMenu = document.createElement('div'); editorMenu.className = 'host-menu-wrap';
const menuButton = document.createElement('button'); menuButton.id = 'host-menu'; menuButton.className = 'host-menu-button'; menuButton.type = 'button'; menuButton.setAttribute('aria-label','Open project navigation'); menuButton.setAttribute('aria-expanded','false');
for (let i=0;i<3;i++) menuButton.append(document.createElement('i'));
const navigationMenu = document.createElement('div'); navigationMenu.id = 'host-menu-popover'; navigationMenu.className = 'host-menu-popover'; navigationMenu.hidden = true;
const navigationAction = (id,label,action) => { const button=document.createElement('button'); button.id=id; button.type='button'; button.textContent=label; button.onclick=()=>{navigationMenu.hidden=true;menuButton.setAttribute('aria-expanded','false');send('editor:action',{action});}; return button; };
navigationMenu.append(navigationAction('host-library','Back to library','library'),navigationAction('host-save','Save now','save'),navigationAction('host-backup','Export project','backup'));
editorMenu.append(menuButton,navigationMenu);

const toolsWrap=document.createElement('div');toolsWrap.className='host-tools-wrap';
const toolMenu=document.createElement('div');toolMenu.id='host-tools-popover';toolMenu.className='host-menu-popover';toolMenu.hidden=true;
const closeToolMenu=()=>{toolMenu.hidden=true;dictionaryButton.setAttribute('aria-expanded','false');};
const menuAction = (id,label,action) => { const button=document.createElement('button'); button.id=id; button.type='button'; button.textContent=label; button.onclick=()=>{closeToolMenu();send('editor:action',{action});}; return button; };
const localMenuAction = (id,label,action) => { const button=document.createElement('button'); button.id=id; button.type='button'; button.textContent=label; button.onclick=()=>{closeToolMenu();action();}; return button; };
const spellcheckAction=localMenuAction('host-spellcheck','',()=>{
  spellcheckEnabled = !spellcheckEnabled; document.getElementById('tl-out').spellcheck = spellcheckEnabled; updateSpellcheckAction(); emit();
});
const updateSpellcheckAction=()=>{spellcheckAction.textContent=`Spell check: ${spellcheckEnabled ? 'on' : 'off'}`;};
const undoFindReplace=localMenuAction('host-undo-find-replace','Undo last replace',()=>{
  if (!lastBulkReplacement || busy) return;
  Object.entries(lastBulkReplacement).forEach(([chapterId, value]) => {
    if (value === null) delete translations[chapterId]; else translations[chapterId]=value;
    const chapterIndex=novel.chapters.findIndex(ch=>ch.id===chapterId);
    if(chapterIndex>=0)updateMark(chapterIndex,translations[chapterId] || '');
  });
  const out=document.getElementById('tl-out'); out.textContent=translations[novel.chapters[cur].id] || '';
  lastBulkReplacement=null; undoFindReplace.disabled=true; updateProg(); emit(true); setStatus('Undid the last project-wide replacement.'); setTimeout(hideStatus,3000);
});
undoFindReplace.disabled=true; updateSpellcheckAction();
toolMenu.append(localMenuAction('host-dictionary','Japanese dictionary (Yomitan)',showDictionary),spellcheckAction,menuAction('host-images','EPUB images','images'),menuAction('host-find-replace','Find and replace','findReplace'),undoFindReplace,menuAction('host-consistency','Check consistency','consistency'),menuAction('host-export-settings','Choose exported chapters','exportSettings'));
toolMenu.append(menuAction('host-custom-prompt','Translation instructions','customPrompt'));
const editorIdentity = document.createElement('div'); editorIdentity.className = 'host-identity';
const editorLogo = document.createElement('img'); editorLogo.src='/brand/dusk-mark.svg'; editorLogo.alt=''; editorLogo.width=30; editorLogo.height=30;
const editorTitle = document.createElement('div');
const editorBrand = document.createElement('span'); editorBrand.textContent='DuskTranslate';
const projectTitle = document.createElement('strong'); projectTitle.id='host-project-title'; projectTitle.textContent='Opening project';
editorTitle.append(editorBrand,projectTitle); editorIdentity.append(editorLogo,editorTitle);
const saveStatus = document.createElement('span'); saveStatus.id='host-save-status'; saveStatus.className='host-save-status'; saveStatus.setAttribute('role','status'); saveStatus.textContent='Opening…';
keyBar.prepend(editorMenu,editorIdentity);
const legacyHeader = document.querySelector('header');
const headerActions = document.createElement('div'); headerActions.className='host-header-actions';
const glossaryButton = legacyHeader?.querySelector('.glossary-toggle'); const themeButton = document.getElementById('theme-btn');
const dictionaryButton=document.createElement('button');dictionaryButton.id='host-tools';dictionaryButton.type='button';dictionaryButton.className='dictionary-toggle';dictionaryButton.setAttribute('aria-label','Open editor tools and dictionary');dictionaryButton.title='Editor tools and dictionary';dictionaryButton.setAttribute('aria-haspopup','menu');dictionaryButton.setAttribute('aria-expanded','false');dictionaryButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H14v17a3 3 0 0 1 3-3h3z"/></svg>';dictionaryButton.onclick=e=>{e.stopPropagation();toolMenu.hidden=!toolMenu.hidden;dictionaryButton.setAttribute('aria-expanded',String(!toolMenu.hidden));};
toolsWrap.append(dictionaryButton,toolMenu);
headerActions.append(saveStatus);
headerActions.append(toolsWrap);
if (glossaryButton) headerActions.append(glossaryButton);
if (themeButton) headerActions.append(themeButton);
keyBar.append(headerActions);

// Search results stay navigable after the host's review dialog is dismissed.
const translationActions = document.querySelector('.pane:not(.pane-left) .pane-lbl .acts');
let linkedScrolling = false;
try { linkedScrolling = localStorage.getItem('dusk-linked-scrolling') === 'true'; } catch {}
const linkedScroll = DuskLinkedScroll(document.getElementById('src-txt'), document.getElementById('tl-out'), linkedScrolling);
const linkedScrollButton = document.createElement('button');
linkedScrollButton.type = 'button';
linkedScrollButton.id = 'host-linked-scroll';
linkedScrollButton.className = 'btn';
linkedScrollButton.title = 'Link Japanese and English scrolling by relative position';
const updateLinkedScrollButton = () => {
  linkedScrollButton.textContent = linkedScrolling ? 'Linked scrolling: on' : 'Link scrolling';
  linkedScrollButton.setAttribute('aria-pressed', String(linkedScrolling));
};
linkedScrollButton.onclick = () => {
  linkedScrolling = !linkedScrolling;
  linkedScroll.setEnabled(linkedScrolling);
  try { localStorage.setItem('dusk-linked-scrolling', String(linkedScrolling)); } catch {}
  updateLinkedScrollButton();
};
updateLinkedScrollButton();
document.querySelector('.controls').append(linkedScrollButton);
document.addEventListener('dusk:chapter', () => linkedScroll.reset());
const findNavigator = document.createElement('div'); findNavigator.id='host-find-navigator'; findNavigator.className='find-navigator'; findNavigator.hidden=true;
const findPrevious = document.createElement('button'); findPrevious.type='button'; findPrevious.className='btn sm'; findPrevious.textContent='←'; findPrevious.setAttribute('aria-label','Previous search match');
const findPosition = document.createElement('output'); findPosition.setAttribute('aria-live','polite');
const findNext = document.createElement('button'); findNext.type='button'; findNext.className='btn sm'; findNext.textContent='→'; findNext.setAttribute('aria-label','Next search match');
const findReview = document.createElement('button'); findReview.type='button'; findReview.className='btn sm'; findReview.textContent='Find'; findReview.setAttribute('aria-label','Return to find and replace');
findPrevious.onclick=()=>send('editor:findNavigate',{delta:-1});
findNext.onclick=()=>send('editor:findNavigate',{delta:1});
findReview.onclick=()=>send('editor:action',{action:findReview.dataset.reviewAction || 'findReview'});
findNavigator.append(findPrevious,findPosition,findNext,findReview);
translationActions?.prepend(findNavigator);
function updateFindNavigator({ position, total, reviewAction = 'findReview', reviewLabel = 'Find' }) {
  const hasNavigation = Number.isInteger(position) && Number.isInteger(total) && total > 0;
  findNavigator.hidden=!hasNavigation && !reviewAction;
  findPrevious.hidden=!hasNavigation; findPosition.hidden=!hasNavigation; findNext.hidden=!hasNavigation;
  findReview.dataset.reviewAction=reviewAction; findReview.textContent=reviewLabel;
  if (hasNavigation) findPosition.value=`${position} of ${total}`;
}
const toolDisclosure = makeDisclosure('Translation tools', 'tool-disclosure');
const controls = document.querySelector('.controls'); controls.before(toolDisclosure.details); toolDisclosure.content.append(controls);
const chapterDisclosure = makeDisclosure('Chapter list', 'chapter-disclosure');
const chapterSidebar = document.querySelector('.sidebar'); chapterSidebar.before(chapterDisclosure.details); chapterDisclosure.content.append(chapterSidebar);
const editorLayout = document.querySelector('.layout');
const editorMain = editorLayout.querySelector(':scope > div'); editorMain.classList.add('editor-main');
const mobileQuery = matchMedia('(max-width: 850px)');
const disclosures = [providerDisclosure.details, toolDisclosure.details, chapterDisclosure.details];
const syncDisclosures = event => {
  disclosures.forEach(details => { details.open = !event.matches; });
  if(event.matches){
    providerDisclosure.content.append(providerControls);
    editorLayout.insertBefore(providerDisclosure.details,chapterDisclosure.details);
  }else{
    keyBar.insertBefore(providerDisclosure.details,headerActions);
    keyBar.insertBefore(providerControls,providerDisclosure.details);
  }
};
syncDisclosures(mobileQuery); mobileQuery.addEventListener('change', syncDisclosures);
disclosures.forEach(details => details.addEventListener('toggle', () => {
  if (mobileQuery.matches && details.open) disclosures.filter(other => other !== details).forEach(other => { other.open=false; });
}));
menuButton.onclick = e => { e.stopPropagation(); navigationMenu.hidden=!navigationMenu.hidden; menuButton.setAttribute('aria-expanded',String(!navigationMenu.hidden)); };
document.addEventListener('click',e=>{if(!editorMenu.contains(e.target)){navigationMenu.hidden=true;menuButton.setAttribute('aria-expanded','false');}if(!toolsWrap.contains(e.target))closeToolMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){navigationMenu.hidden=true;menuButton.setAttribute('aria-expanded','false');closeToolMenu();}});

// Imported chapter titles are text, never markup in the hosted application.
renderList = function () {
  const list = document.getElementById('ch-list'); list.replaceChildren();
  novel.chapters.forEach((ch, i) => {
    const row = document.createElement('div'); row.id = 'ci' + i; row.className = 'ch-item'; row.tabIndex = 0; row.setAttribute('role','button');
    const id = document.createElement('div'); id.className = 'ch-id'; id.textContent = ch.id;
    const title = document.createElement('div'); title.className = 'ch-title'; title.lang='ja'; title.setAttribute('translate','no'); title.textContent = (ch.text.split('\n').find(l => l.trim().length > 2) || ch.id).slice(0,45);
    const meta = document.createElement('div'); meta.className = 'ch-meta'; meta.textContent = `${ch.jp_char_count || 0} chars `;
    const mark = document.createElement('span'); mark.id = 'ck' + i; meta.append(mark); row.append(id,title,meta);
    row.onclick = () => selectCh(i); row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCh(i); } }; list.append(row);
    if (translations[ch.id]) updateMark(i, translations[ch.id]);
  });
};
const originalSelect = selectCh;
selectCh = function(i) { if (busy || preparingTranslation) return; clearSearchHighlights(); originalSelect(i); document.dispatchEvent(new Event('dusk:chapter')); emit(); };
const originalClear = clearTl;
clearTl = function() { if (!canEdit || busy) return; originalClear(); emit(); };
const originalImport = importTXT;
importTXT = function(e) { if(globalThis.DuskCanImportTranslation===false){setStatus('Translated TXT import requires your own paid plan in cloud projects.');e.target.value='';return;} if (!canEdit || busy || preparingTranslation) { setStatus(canEdit ? 'Stop translation before importing text.' : 'Viewer access is read-only.'); e.target.value=''; return; } originalImport(e); };
const originalMark = updateMark;
updateMark = function(i,text) { if (!text?.trim()) { const mark=document.getElementById('ck'+i); if(mark){mark.textContent='';mark.className='';} return; } originalMark(i,text); };
const originalRetry = retryTranslation;
retryTranslation = function() { if (canEdit && !busy && isReady()) originalRetry(); };
const originalTranslate = translateCurrent;
const launchRequests = new Map();
function requestLaunch(action, values={}) {
  return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID();
    const timer=setTimeout(()=>{launchRequests.delete(requestId);reject(new Error('Cloud services did not respond. Translation is paused; please retry.'));},45000);
    launchRequests.set(requestId,{resolve,reject,timer});
    send('editor:launch',{requestId,action,...values});
  });
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==parent || event.data?.type!=='host:launch')return;
  const pending=launchRequests.get(event.data.requestId);if(!pending)return;
  clearTimeout(pending.timer);launchRequests.delete(event.data.requestId);
  if(event.data.error)pending.reject(new Error(event.data.error));else pending.resolve(event.data.result);
});
let preparingTranslation=false;
let activeAttempt=null;
let spendingTimer;
const spendingInput=document.getElementById('api-key');
const showSpendingNotice=()=>{if(spendingInput.value.trim())requestLaunch('spending').then(result=>{if(!result.accepted){spendingInput.value='';onKeyInput();}}).catch(error=>setStatus(error.message));};
spendingInput.addEventListener('input',()=>{clearTimeout(spendingTimer);spendingTimer=setTimeout(showSpendingNotice,700);});
spendingInput.addEventListener('blur',()=>{clearTimeout(spendingTimer);showSpendingNotice();});
async function checkTranslationLease() {
  if(!activeAttempt || activeAttempt.unlimited)return;
  try { await requestLaunch('heartbeat',activeAttempt); }
  catch(error){abortCtrl?.abort();throw error;}
}
const originalOpenRouter=translateOpenRouter;
translateOpenRouter=async function(...args){await checkTranslationLease();return originalOpenRouter(...args);};
const originalAIStudio=translateAIStudio;
translateAIStudio=async function(...args){await checkTranslationLease();return originalAIStudio(...args);};
translateCurrent = async function(options) {
  if (!canEdit || busy || preparingTranslation || !novel || !isReady()) return;
  preparingTranslation=true;
  const chapterId=novel.chapters[cur].id;
  const attemptId=crypto.randomUUID();
  let heartbeat,completed=false;
  const out = document.getElementById('tl-out'); out.contentEditable = 'false';
  try {
    emit(true);
    const reservation=await requestLaunch('reserve',{attemptId,chapterId});
    activeAttempt={attemptId,chapterId,unlimited:reservation.unlimited};
    if(!reservation.unlimited)heartbeat=setInterval(()=>checkTranslationLease().catch(error=>setStatus(error.message)),60000);
    const promise = originalTranslate(options);emit();completed=await promise===true;
    emit(true);
    if(!reservation.unlimited)await requestLaunch(completed?'commit':'release',{attemptId,chapterId});
  } catch(error) {
    setStatus(error.message);
    if(activeAttempt && !activeAttempt.unlimited && !completed)requestLaunch('release',{attemptId,chapterId}).catch(()=>{});
  } finally {
    clearInterval(heartbeat);activeAttempt=null;preparingTranslation=false;
    if (!busy) out.contentEditable = 'true';emit();
  }
};
abortTranslation = function() {
  if (!busy) return;
  clearInterval(watchdog); abortCtrl?.abort();
  setStatus('Stopping and saving partial translation…');
};
const originalEndBusy = endBusy;
endBusy = function() { originalEndBusy(); document.getElementById('tl-out').contentEditable = canEdit && !preparingTranslation ? 'true' : 'false'; emit(); };
const originalUpdate = updateProg;
updateProg = function() { originalUpdate(); emit(); };
doEpubExport = function(){ if(busy)return;send('editor:action',{action:'exportEpub'}); };

function checkNovel(value) {
  if (!Array.isArray(value?.chapters) || !value.chapters.length) throw new Error('This file has no readable chapters.');
  const ids = new Set();
  for (const ch of value.chapters) {
    if (typeof ch.id !== 'string' || typeof ch.text !== 'string' || ids.has(ch.id) || ['__proto__','constructor','prototype'].includes(ch.id)) throw new Error('Invalid or duplicate chapter identifiers.');
    ids.add(ch.id);
  }
  return value;
}
async function parseEpub(blob) {
  epubZip = await JSZip.loadAsync(blob);
  const expanded = Object.values(epubZip.files).reduce((n, f) => n + (f._data?.uncompressedSize || 0), 0);
  if (expanded > 500 * 1024 * 1024) throw new Error('Expanded EPUB exceeds 500 MB. Please use a smaller book.');
  const xml = value => new DOMParser().parseFromString(value, 'application/xml');
  const container = epubZip.file('META-INF/container.xml');
  if (!container) throw new Error('EPUB container is missing.');
  const opfPath = xml(await container.async('string')).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  if (!opfPath || !epubZip.file(opfPath)) throw new Error('EPUB package could not be found.');
  const opf = xml(await epubZip.file(opfPath).async('string'));
  const items = new Map(Array.from(opf.getElementsByTagName('item')).map(n => [n.getAttribute('id'), n]));
  const chapters = [];
  for (const ref of opf.getElementsByTagName('itemref')) {
    const id = ref.getAttribute('idref'); const item = items.get(id);
    if (!item || !/html/.test(item.getAttribute('media-type') || '')) continue;
    const base = new URL(opfPath, 'https://book.invalid/');
    const path = decodeURIComponent(new URL(item.getAttribute('href'), base).pathname.slice(1));
    const file = epubZip.file(path); if (!file) continue;
    const doc = new DOMParser().parseFromString(await file.async('string'), 'text/html');
    doc.querySelectorAll('script,style,rt,rp').forEach(n => n.remove());
    doc.querySelectorAll('img').forEach(n => n.replaceWith(document.createTextNode(n.alt || '')));
    doc.querySelectorAll('br').forEach(n => n.replaceWith(document.createTextNode('\n')));
    doc.querySelectorAll('p,h1,h2,h3,h4,div,li').forEach(n => n.append(document.createTextNode('\n\n')));
    const text = doc.body.textContent.replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    if (!text) continue;
    chapters.push({ id, xhtmlPath: path, text, jp_char_count: (text.match(/[\u3040-\u9fff]/g) || []).length });
  }
  return checkNovel({ chapters, _epubOpfPath: opfPath, _epubOpfDir: opfPath.slice(0,opfPath.lastIndexOf('/')+1) });
}
// Handle typical EPUBs without a publisher-specific .main element too.
const legacyInject = injectTranslation;
injectTranslation = function(original, translated) {
  if (original.includes('<div class="main">')) return legacyInject(original, translated);
  const doc = new DOMParser().parseFromString(original, 'application/xhtml+xml');
  const body = doc.getElementsByTagName('body')[0];
  if (!body || doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XHTML chapter during export.');
  body.replaceChildren();
  for (const block of translated.split(/\n\n+/)) {
    const p = doc.createElementNS('http://www.w3.org/1999/xhtml','p'); p.textContent = block; body.append(p);
  }
  body.setAttribute('style','writing-mode:horizontal-tb;direction:ltr');
  return new XMLSerializer().serializeToString(doc);
};

window.addEventListener('message', async e => {
  if (e.origin !== location.origin || e.source !== parent) return;
  if(e.data.type==='host:quota' && e.data.projectId===projectId){quotaMeterState=e.data.quota;renderQuotaMeter();return;}
  if(e.data.type==='host:entitlements' && e.data.projectId===projectId){setEntitlements(e.data.entitlements);return;}
  if (e.data.type === 'host:flush') { emit(true); send('editor:flushed'); return; }
  if (e.data.type === 'host:theme') { document.body.classList.toggle('eclipse', e.data.theme === 'eclipse'); return; }
  if (e.data.type === 'host:status') { saveStatus.textContent=e.data.message || ''; return; }
  if (e.data.type === 'host:sharedText') {
    if(!novel||typeof e.data.value!=='string')return;
    const chapterIndex=novel.chapters.findIndex(chapter=>chapter.id===e.data.chapterId);
    if(chapterIndex<0)return;
    if(e.data.value)translations[e.data.chapterId]=e.data.value;else delete translations[e.data.chapterId];
    updateMark(chapterIndex,e.data.value);updateProg();
    if(chapterIndex===cur&&!busy){
      const out=document.getElementById('tl-out');
      if(out.textContent!==e.data.value){
        const selection=getSelection(),focused=document.activeElement===out&&selection.rangeCount;
        const offset=focused?Math.min(selection.focusOffset,e.data.value.length):0;
        out.textContent=e.data.value;if(focused)restoreCaret(out,offset);
      }
    }
    return;
  }
  if (e.data.type === 'host:clearFind') { clearSearchHighlights(); return; }
  if (e.data.type === 'host:exportSettings') {
    if(!globalThis.DuskCapabilities.exportSelection)return;
    const ids = new Set(novel?.chapters.map(chapter => chapter.id));
    exportExcluded = [...new Set(Array.isArray(e.data.exportExcluded) ? e.data.exportExcluded : [])].filter(id => ids.has(id));
    emit(true); setStatus(`${exportExcluded.length} chapter${exportExcluded.length === 1 ? '' : 's'} excluded from final exports.`); setTimeout(hideStatus, 3000);
    return;
  }
  if (e.data.type === 'host:findFocus') {
    if (busy || !novel) return;
    const chapterIndex = Math.max(0, Math.min(novel.chapters.length - 1, Number(e.data.chapterIndex) || 0));
    if (chapterIndex !== cur) selectCh(chapterIndex);
    requestAnimationFrame(() => {
      highlightSearchMatch(e.data);
      updateFindNavigator(e.data);
    });
    return;
  }
  if (e.data.type === 'host:findReplace') {
    const { findText, replaceText, caseSensitive, matchMode } = e.data;
    if (!findText || !replaceText) return;
    const regex = createFindRegex(findText, caseSensitive, matchMode);

    let replacedCount = 0;
    const previous = {};
    Object.keys(translations).forEach(chapterId => {
      const original = translations[chapterId];
      if (original.endsWith('…PARTIAL')) return; // Skip currently translating chapters

      const replaced = original.replace(regex, () => replaceText);
      if (replaced !== original) {
        previous[chapterId]=original;
        if (replaced) translations[chapterId] = replaced; else delete translations[chapterId];
        replacedCount++;
        const chapterIndex = novel.chapters.findIndex(ch => ch.id === chapterId);
        if (chapterIndex >= 0) {
          updateMark(chapterIndex, replaced);
        }
      }
    });

    if (!busy) {
      const current=translations[novel.chapters[cur].id];
      document.getElementById('tl-out').textContent = current?.endsWith('…PARTIAL') ? current.slice(0,-8) : (current || '');
    }

    if (replacedCount) { lastBulkReplacement=previous; undoFindReplace.disabled=false; }
    updateProg();
    emit(true);
    setStatus('✓ Replaced text in ' + replacedCount + ' chapters');
    setTimeout(hideStatus, 3000);
    return;
  }
  if (e.data.type !== 'host:open' || projectId) return;
  clearInterval(projectOpenPing);
  projectOpenPing = null;
  projectId = e.data.project.id;
  try {
    const p = e.data.project;
    cloudProject=p.owner!=='guest';setEntitlements(p.entitlements);
    setAccess(p.accessRole);
    projectTitle.textContent = p.title;
    keyInput.value = ''; translations = {}; partialResumes = {}; exportExcluded = []; cur = 0; epubZip = null; devLog = []; window._plainTextRetryChapter = null;
    if (p.snapshot) {
      novel = checkNovel(p.snapshot.novel); translations = p.snapshot.translations || {}; partialResumes = p.snapshot.partialResumes || {}; exportExcluded = (p.snapshot.exportExcluded || []).filter(id => novel.chapters.some(chapter => chapter.id === id));
      if (p.fileName.toLowerCase().endsWith('.epub')) epubZip = await JSZip.loadAsync(p.file);
    } else if (p.fileName.toLowerCase().endsWith('.epub')) novel = await parseEpub(p.file);
    else if (p.fileName.toLowerCase().endsWith('.json')) novel = checkNovel(JSON.parse(await p.file.text()));
    else { const text = await p.file.text(); novel = checkNovel({ chapters:[{id:'chapter-1',text,jp_char_count:(text.match(/[\u3040-\u9fff]/g)||[]).length}] }); }
    document.getElementById('glossary').value = p.snapshot?.glossary || '';
    restoreModelSelection(p.snapshot?.model);
    document.getElementById('style-sel').value = p.snapshot?.style || 'natural';
    if (p.snapshot?.spellcheck === false) {
      spellcheckEnabled = false;
      document.getElementById('tl-out').spellcheck = false;
    } else {
      spellcheckEnabled = true;
      document.getElementById('tl-out').spellcheck = true;
    }
    updateSpellcheckAction();
    initUI(); originalSelect(Math.max(0, Math.min(novel.chapters.length-1,p.snapshot?.cur || 0)));
    onKeyInput(); setAccess(p.accessRole); readyForSave = true; emit(true); document.dispatchEvent(new Event('dusk:chapter')); send('editor:loaded');
  } catch(err) { send('editor:error', { message: err.message }); }
});
// Prevent legacy drop handlers from replacing the active project's original book.
window.addEventListener('drop', e => { e.preventDefault(); e.stopImmediatePropagation(); hideStatus(); }, true);
document.addEventListener('keydown', e => { if(e.ctrlKey && e.shiftKey && e.code === 'KeyD'){ e.preventDefault(); toggleDevMode(); } });
setInterval(() => emit(), 5000);
window.addEventListener('pagehide', () => { clearInterval(projectOpenPing); emit(true); });
// Keep requesting the project until the parent acknowledges it. This covers a
// direct editor-route reload while the host is still restoring authentication.
const requestProject = () => { if (!projectId) send('editor:ready'); };
requestProject();
projectOpenPing = setInterval(requestProject, 5000);
