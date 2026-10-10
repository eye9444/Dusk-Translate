import JSZip from 'jszip';

const MAX_EXPANDED_BYTES = 500 * 1024 * 1024;
const BLOCK_TAGS = 'address,article,blockquote,dd,div,dl,dt,figcaption,figure,h1,h2,h3,h4,h5,h6,header,li,main,nav,ol,p,pre,section,table,td,th,tr,ul';

function archivePath(path, relativeTo = '') {
  const parts = `${relativeTo}/${decodeURIComponent(path || '').replace(/\\/g, '/')}`.split('/');
  const clean = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') clean.pop(); else clean.push(part);
  }
  return clean.join('/');
}

function parseXml(value, label) {
  const doc = new DOMParser().parseFromString(value, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(`${label} contains invalid XML.`);
  return doc;
}

function chapterText(markup) {
  const doc = new DOMParser().parseFromString(markup, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) throw new Error('An EPUB chapter contains invalid XHTML.');
  const body = doc.querySelector('body');
  if (!body) return { text:'', title:'' };
  const title = (body.querySelector('h1,h2,h3')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  body.querySelectorAll('script,style,svg,template,rt,rp').forEach(node => node.remove());
  body.querySelectorAll('img').forEach(node => node.replaceWith(doc.createTextNode(node.getAttribute('alt') || '')));
  body.querySelectorAll('br').forEach(node => node.replaceWith(doc.createTextNode('\n')));
  body.querySelectorAll(BLOCK_TAGS).forEach(node => node.append(doc.createTextNode('\n\n')));
  return {
    title,
    text:body.textContent.replace(/\r/g, '').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

function navigationTitles(opf, zip, opfDirectory) {
  const titles = new Map();
  const items = [...opf.getElementsByTagName('item')];
  const nav = items.find(item => /(^|\s)nav(\s|$)/.test(item.getAttribute('properties') || ''));
  const ncx = items.find(item => item.getAttribute('media-type') === 'application/x-dtbncx+xml');
  const entry = nav || ncx;
  if (!entry) return Promise.resolve(titles);
  const path = archivePath(entry.getAttribute('href'), opfDirectory);
  const file = zip.file(path);
  if (!file) return Promise.resolve(titles);
  return file.async('string').then(markup => {
    const doc = parseXml(markup, 'EPUB navigation');
    if (nav) for (const link of doc.getElementsByTagName('a')) {
      const href = (link.getAttribute('href') || '').split('#')[0];
      if (href) titles.set(archivePath(href, path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''), link.textContent.replace(/\s+/g, ' ').trim().slice(0, 100));
    }
    else for (const point of doc.getElementsByTagName('navPoint')) {
      const href = (point.getElementsByTagName('content')[0]?.getAttribute('src') || '').split('#')[0];
      const title = point.getElementsByTagName('text')[0]?.textContent.replace(/\s+/g, ' ').trim().slice(0, 100);
      if (href && title) titles.set(archivePath(href, path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''), title);
    }
    return titles;
  });
}

export async function parseEpubSource(file) {
  const zip = await JSZip.loadAsync(file);
  const expanded = Object.values(zip.files).reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0);
  if (expanded > MAX_EXPANDED_BYTES) throw new Error('Expanded EPUB exceeds 500 MB. Please use a smaller book.');
  const containerEntry = zip.file('META-INF/container.xml');
  if (!containerEntry) throw new Error('EPUB container is missing.');
  const container = parseXml(await containerEntry.async('string'), 'EPUB container');
  const opfPath = archivePath(container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path'));
  const opfEntry = zip.file(opfPath);
  if (!opfEntry) throw new Error('EPUB package could not be found.');
  const opf = parseXml(await opfEntry.async('string'), 'EPUB package');
  const opfDirectory = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const titles = await navigationTitles(opf, zip, opfDirectory);
  const items = new Map([...opf.getElementsByTagName('item')].map(item => [item.getAttribute('id'), item]));
  const chapters = [];
  for (const ref of opf.getElementsByTagName('itemref')) {
    const id = ref.getAttribute('idref');
    const item = items.get(id);
    if (!item || !/html/i.test(item.getAttribute('media-type') || '')) continue;
    const path = archivePath(item.getAttribute('href'), opfDirectory);
    const entry = zip.file(path);
    if (!entry) continue;
    const parsed = chapterText(await entry.async('string'));
    if (!parsed.text) continue;
    chapters.push({
      id,
      title:titles.get(path) || parsed.title || `Section ${chapters.length + 1}`,
      xhtmlPath:path,
      text:parsed.text,
      jp_char_count:Array.from(parsed.text).length,
    });
  }
  if (!chapters.length) throw new Error('No readable chapters found in this book.');
  return { chapters, _epubOpfPath:opfPath, _epubOpfDir:opfDirectory ? `${opfDirectory}/` : '' };
}

export async function parseSourceFile(file) {
  if (/\.epub$/i.test(file.name)) return parseEpubSource(file);
  if (/\.json$/i.test(file.name)) return JSON.parse(await file.text());
  const text = await file.text();
  if (!text.trim()) throw new Error('This TXT file is empty.');
  return {
    projectType:'web-novel',
    chapters:[{
      id:crypto.randomUUID(),
      title:file.name.replace(/\.[^.]+$/, '').slice(0, 100) || 'Chapter 1',
      text,
      jp_char_count:Array.from(text).length,
    }],
  };
}

export function emptyWebNovel() {
  return { projectType:'web-novel', chapters:[] };
}
