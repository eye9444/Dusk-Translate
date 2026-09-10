export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export function validateFile(file) {
  if (!file || !/\.(epub|json|txt|zip)$/i.test(file.name)) throw new Error('Choose an EPUB, source JSON, TXT file, or project backup ZIP.');
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error('Choose a nonempty file no larger than 20 MB.');
}
export function validateNovel(novel) {
  if (!novel || !Array.isArray(novel.chapters) || !novel.chapters.length) throw new Error('No readable chapters found in this book.');
  const ids = new Set();
  for (const ch of novel.chapters) {
    if (!ch || typeof ch.id !== 'string' || typeof ch.text !== 'string' || ids.has(ch.id) || ['__proto__','constructor','prototype'].includes(ch.id)) throw new Error('Invalid or duplicate chapter IDs in source JSON.');
    ids.add(ch.id);
  }
  return novel;
}
// Only project content crosses the persistence boundary, never keys or dev logs.
export function cleanSnapshot(s) {
  if (!s?.novel) return null;
  validateNovel(s.novel);
  const chapters = s.novel.chapters.map(ch => ({ id: ch.id, text: ch.text, jp_char_count: Number(ch.jp_char_count) || 0, ...(typeof ch.xhtmlPath === 'string' ? { xhtmlPath: ch.xhtmlPath } : {}) }));
  const translations = Object.fromEntries(chapters.filter(ch => typeof s.translations?.[ch.id] === 'string').map(ch => [ch.id, s.translations[ch.id]]));
  return {
    novel: { chapters, _epubOpfPath: s.novel._epubOpfPath, _epubOpfDir: s.novel._epubOpfDir },
    translations, cur: Math.min(chapters.length - 1, Math.max(0, Math.trunc(Number(s.cur) || 0))),
    glossary: String(s.glossary || ''), model: String(s.model || ''),
    style: ['natural','faithful','liberal'].includes(s.style) ? s.style : 'natural'
  };
}
export function progress(snapshot) {
  const chapters = snapshot?.novel?.chapters || [];
  const done = chapters.filter(ch => snapshot.translations[ch.id]?.trim() && !snapshot.translations[ch.id].endsWith('…PARTIAL')).length;
  return { total: chapters.length, done, percent: chapters.length ? Math.round(done * 100 / chapters.length) : 0 };
}
