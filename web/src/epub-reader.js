import JSZip from 'jszip';

const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const BLOCK_TAGS = new Set(['address', 'article', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul']);
const SKIP_TAGS = new Set(['canvas', 'embed', 'iframe', 'object', 'script', 'style', 'svg', 'template']);

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

async function readerBlocks(markup, chapterPath, zip) {
  const doc = new DOMParser().parseFromString(markup, 'application/xhtml+xml');
  const root = doc.querySelector('body') || doc.documentElement;
  const blocks = [], base = chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/')) : '';
  let buffer = '';
  const flush = () => { const text = cleanText(buffer); if (text) blocks.push({ type:'text', text }); buffer = ''; };
  const walk = async node => {
    if (node.nodeType === Node.TEXT_NODE) { buffer += node.nodeValue || ''; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.localName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'img') {
      // Japanese EPUBs commonly encode punctuation such as "~" as a tiny gaiji image.
      // Keep it inline instead of promoting it into a full-page reader illustration.
      if (node.classList.contains('gaiji-line')) {
        buffer += node.getAttribute('alt') || '';
        return;
      }
      flush();
      const source = node.getAttribute('src') || '', path = archivePath(source.split(/[?#]/, 1)[0], base), entry = path && zip.file(path);
      if (entry) blocks.push({ type:'image', src:URL.createObjectURL(new Blob([await entry.async('arraybuffer')], { type:imageMimeType(path) })), alt:cleanText(node.getAttribute('alt') || '') });
      else if (node.getAttribute('alt')) buffer += `[${node.getAttribute('alt')}]`;
      return;
    }
    if (BLOCK_TAGS.has(tag) || tag === 'br') flush();
    for (const child of node.childNodes) await walk(child);
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
  const heading = cleanText(doc.querySelector('h1,h2,h3')?.textContent || '');
  if (heading) return heading;
  const first = paragraphs[0] || '';
  return /^(chapter(?:\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|[ivxlcdm]+))?|prologue|epilogue|contents|第[一二三四五六七八九十0-9]+[章話])/iu.test(first) ? first.slice(0, 180) : '';
}

function textOf(node) {
  return node?.textContent?.trim() || '';
}

function injectTranslation(markup, translation) {
  const doc = new DOMParser().parseFromString(markup, 'application/xhtml+xml');
  const body = doc.querySelector('body');
  if (!body || doc.querySelector('parsererror')) throw new Error('A translated EPUB chapter contains invalid XHTML.');
  // Keep the book's local illustrations available in the translated reader edition.
  const images = [...body.querySelectorAll('img')].map(image => image.cloneNode(true));
  body.replaceChildren();
  for (const block of translation.split(/\n\n+/).map(cleanText).filter(Boolean)) {
    const paragraph = doc.createElementNS('http://www.w3.org/1999/xhtml', 'p');
    paragraph.textContent = block;
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
  if (expanded > MAX_EXPANDED_BYTES) throw new Error('This EPUB expands beyond the reader safety limit of 100 MB.');

  const containerEntry = zip.file('META-INF/container.xml');
  if (!containerEntry) throw new Error('This EPUB is missing its container metadata.');
  const container = new DOMParser().parseFromString(await containerEntry.async('string'), 'application/xml');
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('This EPUB does not identify its package file.');

  const normalizedOpf = archivePath(opfPath);
  const opfEntry = zip.file(normalizedOpf);
  if (!opfEntry) throw new Error('This EPUB package file could not be opened.');
  const opf = new DOMParser().parseFromString(await opfEntry.async('string'), 'application/xml');
  const opfDirectory = normalizedOpf.includes('/') ? normalizedOpf.slice(0, normalizedOpf.lastIndexOf('/')) : '';
  const metadataTitle = textOf(opf.querySelector('title, dc\\:title')) || fileName.replace(/\.epub$/i, '');
  const manifest = new Map([...opf.querySelectorAll('manifest > item')].map(item => [item.getAttribute('id'), item]));
  const spine = [...opf.querySelectorAll('spine > itemref')];
  if (!spine.length) throw new Error('This EPUB does not contain a readable chapter spine.');

  const chapters = [], pendingBlocks = [];
  for (const [index, itemref] of spine.entries()) {
    const item = manifest.get(itemref.getAttribute('idref'));
    const href = item?.getAttribute('href');
    if (!item || !href) continue;
    const path = archivePath(href, opfDirectory);
    const entry = zip.file(path);
    if (!entry) continue;
    const markup = await entry.async('string');
    const blocks = await readerBlocks(markup, path, zip);
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
  if (expanded > MAX_EXPANDED_BYTES) throw new Error('This EPUB expands beyond the reader safety limit of 100 MB.');

  for (const chapter of selected) {
    const entry = zip.file(chapter.xhtmlPath);
    if (!entry) throw new Error(`The original EPUB chapter ${chapter.id} is missing.`);
    const translation = translations[chapter.id].replace(/…PARTIAL$/, '').trim();
    zip.file(chapter.xhtmlPath, injectTranslation(await entry.async('string'), translation));
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
