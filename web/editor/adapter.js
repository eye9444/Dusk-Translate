/* Classic script intentionally shares the standalone editor's lexical state. */
let projectId = null;
let readyForSave = false;
let lastSnapshot = '';
let lastBusy = false;
const send = (type, extra = {}) => parent.postMessage({ type, projectId, ...extra }, location.origin);
function snapshot() {
  const saved = { ...translations };
  if (busy && novel) {
    const text = Array.from(document.getElementById('tl-out').childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('');
    if (text) saved[novel.chapters[cur].id] = text + '…PARTIAL';
  }
  return { novel, translations: saved, cur, glossary: document.getElementById('glossary').value, model: getModelVal(), style: document.getElementById('style-sel').value };
}
function emit(force = false) {
  if (!readyForSave || !novel) return;
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
  updateMark(cur, value); updateProg(); emit();
}
document.getElementById('tl-out').addEventListener('input', saveManualText);
document.getElementById('tl-out').addEventListener('paste', e => {
  e.preventDefault(); if (busy) return;
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

// Imported chapter titles are text, never markup in the hosted application.
renderList = function () {
  const list = document.getElementById('ch-list'); list.replaceChildren();
  novel.chapters.forEach((ch, i) => {
    const row = document.createElement('div'); row.id = 'ci' + i; row.className = 'ch-item'; row.tabIndex = 0; row.setAttribute('role','button');
    const id = document.createElement('div'); id.className = 'ch-id'; id.textContent = ch.id;
    const title = document.createElement('div'); title.className = 'ch-title'; title.textContent = (ch.text.split('\n').find(l => l.trim().length > 2) || ch.id).slice(0,45);
    const meta = document.createElement('div'); meta.className = 'ch-meta'; meta.textContent = `${ch.jp_char_count || 0} chars `;
    const mark = document.createElement('span'); mark.id = 'ck' + i; meta.append(mark); row.append(id,title,meta);
    row.onclick = () => selectCh(i); row.onkeydown = e => { if (e.key === 'Enter') selectCh(i); }; list.append(row);
    if (translations[ch.id]) updateMark(i, translations[ch.id]);
  });
};
const originalSelect = selectCh;
selectCh = function(i) { if (busy) return; originalSelect(i); emit(); };
const originalClear = clearTl;
clearTl = function() { if (busy) return; originalClear(); emit(); };
const originalImport = importTXT;
importTXT = function(e) { if (busy) { setStatus('Stop translation before importing text.'); e.target.value=''; return; } originalImport(e); };
const originalMark = updateMark;
updateMark = function(i,text) { if (!text?.trim()) { const mark=document.getElementById('ck'+i); if(mark){mark.textContent='';mark.className='';} return; } originalMark(i,text); };
const originalRetry = retryTranslation;
retryTranslation = function() { if (!busy && isReady()) originalRetry(); };
const originalTranslate = translateCurrent;
translateCurrent = async function() {
  if (busy || !novel || !isReady()) return;
  const out = document.getElementById('tl-out'); out.contentEditable = 'false';
  try { const promise = originalTranslate(); emit(); await promise; }
  finally { if (!busy) out.contentEditable = 'true'; emit(); }
};
abortTranslation = function() {
  if (!busy) return;
  clearInterval(watchdog); abortCtrl?.abort();
  setStatus('Stopping and saving partial translation…');
};
const originalEndBusy = endBusy;
endBusy = function() { originalEndBusy(); document.getElementById('tl-out').contentEditable = 'true'; emit(); };
const originalUpdate = updateProg;
updateProg = function() { originalUpdate(); emit(); };

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
  if (expanded > 100 * 1024 * 1024) throw new Error('Expanded EPUB exceeds 100 MB. Please use a smaller book.');
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
  if (e.data.type === 'host:flush') { emit(true); send('editor:flushed'); return; }
  if (e.data.type === 'host:theme') { document.body.classList.toggle('eclipse', e.data.theme === 'eclipse'); return; }
  if (e.data.type !== 'host:open' || projectId) return;
  projectId = e.data.project.id;
  try {
    const p = e.data.project;
    keyInput.value = ''; translations = {}; cur = 0; epubZip = null; devLog = []; window._plainTextRetryChapter = null;
    if (p.snapshot) {
      novel = checkNovel(p.snapshot.novel); translations = p.snapshot.translations || {};
      if (p.fileName.toLowerCase().endsWith('.epub')) epubZip = await JSZip.loadAsync(p.file);
    } else if (p.fileName.toLowerCase().endsWith('.epub')) novel = await parseEpub(p.file);
    else if (p.fileName.toLowerCase().endsWith('.json')) novel = checkNovel(JSON.parse(await p.file.text()));
    else { const text = await p.file.text(); novel = checkNovel({ chapters:[{id:'chapter-1',text,jp_char_count:(text.match(/[\u3040-\u9fff]/g)||[]).length}] }); }
    document.getElementById('glossary').value = p.snapshot?.glossary || '';
    if (p.snapshot?.model && Array.from(document.getElementById('model-select').options).some(o => o.value === p.snapshot.model)) document.getElementById('model-select').value = p.snapshot.model;
    document.getElementById('style-sel').value = p.snapshot?.style || 'natural';
    initUI(); originalSelect(Math.max(0, Math.min(novel.chapters.length-1,p.snapshot?.cur || 0)));
    onKeyInput(); readyForSave = true; emit(true); send('editor:loaded');
  } catch(err) { send('editor:error', { message: err.message }); }
});
// Prevent legacy drop handlers from replacing the active project's original book.
window.addEventListener('drop', e => { e.preventDefault(); e.stopImmediatePropagation(); setStatus('Create a new project from the library to load another book.'); }, true);
document.addEventListener('keydown', e => { if(e.ctrlKey && e.shiftKey && e.code === 'KeyD'){ e.preventDefault(); toggleDevMode(); } });
setInterval(() => emit(), 1000);
window.addEventListener('pagehide', () => emit(true));
send('editor:ready');
