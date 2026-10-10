import JSZip from 'jszip';

const MAX_EXPANDED_BYTES = 500 * 1024 * 1024;
const MAX_PROCESSED_BYTES = 128 * 1024 * 1024;
const MAX_MARKUP_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_REFERENCES = 4096;
const MAX_SPINE_ENTRIES = 2048;
const MAX_NODES = 200000;
const MAX_DEPTH = 128;

// Count actual streamed bytes, including repeated spine reads, not just ZIP metadata.
function readEntry(entry, state, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const stream = entry.internalStream('uint8array');
    stream.on('data', chunk => {
      size += chunk.length;
      state.bytes += chunk.length;
      if (size > limit || state.bytes > MAX_PROCESSED_BYTES) {
        stream.pause();
        chunks.length = 0;
        reject(new Error('This EPUB exceeds the reader processing byte limit.'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(new Blob(chunks)));
    stream.resume();
  });
}
const BLOCK_TAGS = new Set(['address', 'article', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul']);
const SKIP_TAGS = new Set(['canvas', 'embed', 'iframe', 'object', 'script', 'style', 'svg', 'template', 'rt', 'rp']);

function archivePath(path, relativeTo = '') {
  const decoded = decodeURIComponent(path).replace(/\\/g, '/');
  const parts = `${relativeTo}/${decoded}`.split('/');
  const clean = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') clean.pop();
    else clean.push(part);
  }
  return clean.join('/');
}

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function markupParagraphs(markup) {
  const doc = new DOMParser().parseFromString(markup, 'application/xhtml+xml');
  const root = doc.querySelector('body') || doc.documentElement;
  const paragraphs = [];
  let buffer = '';

  const flush = () => {
    const text = cleanText(buffer);
    if (text) paragraphs.push(text);
    buffer = '';
  };
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.nodeValue || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.localName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'img') {
      const alt = cleanText(node.getAttribute('alt') || '');
      if (alt) buffer += `[${alt}]`;
      return;
    }
    if (BLOCK_TAGS.has(tag)) flush();
    if (tag === 'br') flush();
    for (const child of node.childNodes) walk(child);
    if (BLOCK_TAGS.has(tag) || tag === 'br') flush();
  };

  walk(root);
  flush();
  return paragraphs;
}

function imageMimeType(path) {
  const extension = path.split('.').pop()?.toLowerCase();
  return ({ jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', avif:'image/avif', svg:'image/svg+xml' })[extension] || 'application/octet-stream';
}

async function readerBlocks(markup, chapterPath, zip, state) {
  const doc = new DOMParser().parseFromString(markup, 'application/xhtml+xml');
  const root = doc.querySelector('body') || doc.documentElement;
  const blocks = [], base = chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/')) : '';
  let buffer = '', ruby = [];
  const flush = () => {
    const text = cleanText(buffer);
    if (text) blocks.push({ type:'text', text, ruby: ruby.map(item => ({
      start: Math.min(text.length, buffer.slice(0, item.start).replace(/\s+/g, ' ').trimStart().length),
      end: Math.min(text.length, buffer.slice(0, item.end).replace(/\s+/g, ' ').trimStart().length),
      reading: item.reading,
    })).filter(item => item.end > item.start) });
    buffer = ''; ruby = [];
  };
  const walk = async (node, depth = 0) => {
    if (++state.nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error('This EPUB exceeds the reader traversal limit.');
    if (node.nodeType === Node.TEXT_NODE) { buffer += node.nodeValue || ''; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.localName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'ruby') {
      let start = buffer.length;
      for (const child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && child.localName.toLowerCase() === 'rt') {
          const reading = cleanText(child.textContent);
          if (reading && buffer.length > start) ruby.push({ start, end: buffer.length, reading });
          start = buffer.length;
        } else await walk(child, depth + 1);
      }
      return;
    }
    if (tag === 'img') {
      if (++state.imageReferences > MAX_IMAGE_REFERENCES) throw new Error('This EPUB exceeds the reader image reference limit.');
      // Japanese EPUBs commonly encode punctuation such as "~" as a tiny gaiji image.
      // Keep it inline instead of promoting it into a full-page reader illustration.
      if (node.classList.contains('gaiji-line')) {
        buffer += node.getAttribute('alt') || '';
        return;
      }
      flush();
      const source = node.getAttribute('src') || '', path = archivePath(source.split(/[?#]/, 1)[0], base), entry = path && zip.file(path);
      if (entry) {
        if (!state.images.has(path)) {
          const data = await readEntry(entry, state, MAX_IMAGE_BYTES);
          state.images.set(path, URL.createObjectURL(new Blob([data], { type:imageMimeType(path) })));
        }
        blocks.push({ type:'image', src:state.images.get(path), alt:cleanText(node.getAttribute('alt') || '') });
      }
      else if (node.getAttribute('alt')) buffer += `[${node.getAttribute('alt')}]`;
      return;
    }
    if (BLOCK_TAGS.has(tag) || tag === 'br') flush();
    for (const child of node.childNodes) await walk(child, depth + 1);
    if (BLOCK_TAGS.has(tag) || tag === 'br') flush();
  };
  await walk(root); flush();
  return blocks;
}

function firstHeading(paragraphs, fallback) {
  const heading = paragraphs.find(text => text.length <= 180);
  return heading || fallback;
}

function sectionHeading(markup, paragraphs) {
  const doc = new DOMParser().parseFromString(markup, 'application/xhtml+xml');
  doc.querySelectorAll('rt,rp').forEach(node => node.remove());
  const heading = cleanText(doc.querySelector('h1,h2,h3')?.textContent || '');
  if (heading) return heading;
  const first = paragraphs[0] || '';
  return /^(chapter(?:\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|[ivxlcdm]+))?|prologue|epilogue|contents|第[一二三四五六七八九十0-9]+[章話])/iu.test(first) ? first.slice(0, 180) : '';
}

function textOf(node) {
  return node?.textContent?.trim() || '';
}

function appendRubyText(doc,parent,text,annotations=[],offset=0){
  let cursor=0;
  for(const item of annotations.filter(item=>item.start>=offset&&item.end<=offset+text.length).sort((a,b)=>a.start-b.start)){
    const start=item.start-offset,end=item.end-offset;if(start<cursor||end<=start)continue;
    parent.append(doc.createTextNode(text.slice(cursor,start)));
    const ruby=doc.createElementNS('http://www.w3.org/1999/xhtml','ruby'),rt=doc.createElementNS('http://www.w3.org/1999/xhtml','rt');
    ruby.append(doc.createTextNode(text.slice(start,end)));rt.textContent=item.reading;ruby.append(rt);parent.append(ruby);cursor=end;
  }
  parent.append(doc.createTextNode(text.slice(cursor)));
}

function injectTranslation(markup, translation, ruby=[]) {
  const doc = new DOMParser().parseFromString(markup, 'application/xhtml+xml');
  const body = doc.querySelector('body');
  if (!body || doc.querySelector('parsererror')) throw new Error('A translated EPUB chapter contains invalid XHTML.');
  // Keep the book's local illustrations available in the translated reader edition.
  const images = [...body.querySelectorAll('img')].map(image => image.cloneNode(true));
  body.replaceChildren();
  let searchFrom=0;
  for (const raw of translation.split(/\n\n+/).filter(block=>block.trim())) {
    const block=raw.trim(),offset=translation.indexOf(block,searchFrom);searchFrom=offset+block.length;
    const paragraph = doc.createElementNS('http://www.w3.org/1999/xhtml', 'p');
    appendRubyText(doc,paragraph,block,ruby,offset);
    body.append(paragraph);
  }
  images.forEach(image => body.append(image));
  body.setAttribute('style', 'writing-mode:horizontal-tb;direction:ltr');
  doc.documentElement.setAttribute('xml:lang', 'en');
  doc.documentElement.setAttribute('lang', 'en');
  return new XMLSerializer().serializeToString(doc);
}

export async function readEpub(file, fileName = file?.name || 'Untitled EPUB') {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose an EPUB file to open in the reader.');
  const zip = await JSZip.loadAsync(file);
  const expanded = Object.values(zip.files).reduce((total, entry) => total + (entry._data?.uncompressedSize || 0), 0);
  if (expanded > MAX_EXPANDED_BYTES) throw new Error('This EPUB expands beyond the reader safety limit of 500 MB.');

  const state = { bytes:0, nodes:0, imageReferences:0, images:new Map() };
  try {
  const containerEntry = zip.file('META-INF/container.xml');
  if (!containerEntry) throw new Error('This EPUB is missing its container metadata.');
  const container = new DOMParser().parseFromString(await (await readEntry(containerEntry, state, MAX_MARKUP_BYTES)).text(), 'application/xml');
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('This EPUB does not identify its package file.');

  const normalizedOpf = archivePath(opfPath);
  const opfEntry = zip.file(normalizedOpf);
  if (!opfEntry) throw new Error('This EPUB package file could not be opened.');
  const opf = new DOMParser().parseFromString(await (await readEntry(opfEntry, state, MAX_MARKUP_BYTES)).text(), 'application/xml');
  const opfDirectory = normalizedOpf.includes('/') ? normalizedOpf.slice(0, normalizedOpf.lastIndexOf('/')) : '';
  const metadataTitle = textOf(opf.querySelector('title, dc\\:title')) || fileName.replace(/\.epub$/i, '');
  const manifest = new Map([...opf.querySelectorAll('manifest > item')].map(item => [item.getAttribute('id'), item]));
  const spine = [...opf.querySelectorAll('spine > itemref')];
  if (!spine.length) throw new Error('This EPUB does not contain a readable chapter spine.');
  if (spine.length > MAX_SPINE_ENTRIES) throw new Error('This EPUB exceeds the reader spine entry limit.');

  const chapters = [], pendingBlocks = [];
  for (const [index, itemref] of spine.entries()) {
    const item = manifest.get(itemref.getAttribute('idref'));
    const href = item?.getAttribute('href');
    if (!item || !href) continue;
    const path = archivePath(href, opfDirectory);
    const entry = zip.file(path);
    if (!entry) continue;
    const markup = await (await readEntry(entry, state, MAX_MARKUP_BYTES)).text();
    const blocks = await readerBlocks(markup, path, zip, state);
    const paragraphs = blocks.filter(block => block.type === 'text').map(block => block.text);
    if (!blocks.length) continue;
    const title = sectionHeading(markup, paragraphs);
    // EPUB spine files are often continuation fragments or illustration pages.
    // Keep them in reading order inside the nearest real titled section.
    if ((!title || !paragraphs.length) && chapters.length) {
      chapters.at(-1).blocks.push(...blocks);
      continue;
    }
    if ((!title || !paragraphs.length) && !chapters.length) { pendingBlocks.push(...blocks); continue; }
    chapters.push({ id: item.getAttribute('id') || `section-${index + 1}`, title: title || `Section ${chapters.length + 1}`, paragraphs, blocks:[...pendingBlocks.splice(0), ...blocks] });
  }
  if (!chapters.length && pendingBlocks.length) chapters.push({ id:'section-1', title:'Section 1', paragraphs:[], blocks:pendingBlocks });
  if (!chapters.length) throw new Error('No readable chapters were found in this EPUB.');
  return { title: metadataTitle, chapters };
  } catch (error) {
    for (const url of state.images.values()) URL.revokeObjectURL(url);
    throw error;
  }
}

export async function buildTranslatedEpub(file, snapshot) {
  const chapters = snapshot?.novel?.chapters || [];
  const translations = snapshot?.translations || {}, excluded = new Set(snapshot?.exportExcluded || []);
  const selected = chapters.filter(chapter => !excluded.has(chapter.id));
  if (!selected.length || selected.some(chapter => !translations[chapter.id]?.trim() || translations[chapter.id].endsWith('…PARTIAL'))) {
    throw new Error('Finish every selected chapter before opening the translated EPUB.');
  }
  const zip = await JSZip.loadAsync(file);
  const expanded = Object.values(zip.files).reduce((total, entry) => total + (entry._data?.uncompressedSize || 0), 0);
  if (expanded > MAX_EXPANDED_BYTES) throw new Error('This EPUB expands beyond the reader safety limit of 500 MB.');

  for (const chapter of selected) {
    const entry = zip.file(chapter.xhtmlPath);
    if (!entry) throw new Error(`The original EPUB chapter ${chapter.id} is missing.`);
    const translation = translations[chapter.id].replace(/…PARTIAL$/, '').trim();
    zip.file(chapter.xhtmlPath, injectTranslation(await entry.async('string'), translation,snapshot.publishedRuby?.[chapter.id]||[]));
  }
  const opfPath = snapshot.novel._epubOpfPath;
  const opfEntry = opfPath && zip.file(opfPath);
  if (opfEntry) {
    const opf = (await opfEntry.async('string'))
      .replace(/page-progression-direction="rtl"/g, 'page-progression-direction="ltr"')
      .replace(/\s*properties="page-spread-(left|right)"/g, '')
      .replace(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*\/?>(?:<\/itemref>)?/g, (itemref, id) => excluded.has(id) ? '' : itemref);
    zip.file(opfPath, opf);
  }
  return zip.generateAsync({ type:'blob', mimeType:'application/epub+zip', compression:'DEFLATE', compressionOptions:{ level:6 } });
}

function xmlEscape(value) {
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

export function snapshotReaderBook(title, snapshot, edition = 'original') {
  const translations=snapshot?.translations||{},excluded=new Set(snapshot?.exportExcluded||[]);
  const chapters=(snapshot?.novel?.chapters||[]).filter(chapter=>edition==='original'||!excluded.has(chapter.id)).map((chapter,index)=>{
    const text=edition==='translated'?translations[chapter.id]:chapter.text;
    if(edition==='translated'&&(!text?.trim()||text.endsWith('…PARTIAL')))throw new Error('Finish every selected chapter before opening the translated edition.');
    const paragraphs=String(text||'').split(/\n\s*\n/u).map(value=>value.trim()).filter(Boolean);
    return {id:chapter.id,title:chapter.title||`Chapter ${index+1}`,paragraphs,blocks:paragraphs.map(text=>({type:'text',text}))};
  });
  if(!chapters.length)throw new Error('This project does not have any readable chapters yet.');
  return {title,chapters};
}

export async function buildWebNovelEpub(title, snapshot) {
  const book=snapshotReaderBook(title,snapshot,'translated'),zip=new JSZip(),identifier=crypto.randomUUID();
  zip.file('mimetype','application/epub+zip',{compression:'STORE'});
  zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const manifest=[],spine=[],nav=[];
  book.chapters.forEach((chapter,index)=>{
    const id=`chapter-${index+1}`,path=`${id}.xhtml`;
    const paragraphs=chapter.paragraphs.map(text=>`<p>${xmlEscape(text)}</p>`).join('\n');
    zip.file(`OEBPS/${path}`,`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>${xmlEscape(chapter.title)}</title><meta charset="UTF-8"/><style>body{font-family:serif;line-height:1.7;margin:8%}h1{font-size:1.6em}p{white-space:pre-wrap}</style></head><body><h1>${xmlEscape(chapter.title)}</h1>${paragraphs}</body></html>`);
    manifest.push(`<item id="${id}" href="${path}" media-type="application/xhtml+xml"/>`);spine.push(`<itemref idref="${id}"/>`);nav.push(`<li><a href="${path}">${xmlEscape(chapter.title)}</a></li>`);
  });
  zip.file('OEBPS/nav.xhtml',`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${nav.join('')}</ol></nav></body></html>`);
  zip.file('OEBPS/content.opf',`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${identifier}</dc:identifier><dc:title>${xmlEscape(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/,'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  return zip.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE',compressionOptions:{level:6}});
}
