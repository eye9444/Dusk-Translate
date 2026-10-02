import * as Y from 'yjs';

export const DOCUMENT_VERSION = 1;

// Initialization must happen once on the server; peers load the same seed update.
export function createDocumentSeed(snapshot) {
  const doc = new Y.Doc();
  doc.transact(() => {
    doc.getMap('metadata').set('version', DOCUMENT_VERSION);
    for (const chapter of snapshot?.novel?.chapters || []) {
      doc.getText(`source:${chapter.id}`).insert(0, chapter.text);
      doc.getText(`translation:${chapter.id}`).insert(0, snapshot.translations?.[chapter.id] || '');
    }
  });
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

export function openSharedDocument(seed) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, seed, 'load');
  if (doc.getMap('metadata').get('version') !== DOCUMENT_VERSION) {
    doc.destroy();
    throw new Error('Unsupported collaborative document version.');
  }
  // Decoded root types are generic until their concrete type is requested.
  for (const name of doc.share.keys()) {
    if (name.startsWith('source:') || name.startsWith('translation:')) doc.getText(name);
  }
  return doc;
}

export function passage(doc, chapterId, pane = 'translation') {
  if (!['source', 'translation'].includes(pane)) throw new Error('Invalid text pane.');
  return doc.getText(`${pane}:${chapterId}`);
}

export function replaceRange(text, start, end, replacement, origin) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length || typeof replacement !== 'string') {
    throw new Error('Invalid text edit.');
  }
  text.doc.transact(() => {
    if (end > start) text.delete(start, end - start);
    if (replacement) text.insert(start, replacement);
  }, origin);
}

export function anchorRange(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) throw new Error('Select a nonempty text range.');
  return {
    start: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, start, 0)),
    end: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, end, -1)),
    quote: text.toString().slice(start, end),
  };
}

export function resolveAnchor(doc, anchor) {
  const start = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(anchor.start), doc);
  const end = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(anchor.end), doc);
  if (!start || !end || start.type !== end.type || end.index <= start.index) return { status: 'unanchored', quote: anchor.quote };
  const quote = start.type.toString().slice(start.index, end.index);
  return { start: start.index, end: end.index, quote, status: quote === anchor.quote ? 'attached' : 'needs-review' };
}

export function createLocalUndo(doc, chapterIds, origin) {
  return new Y.UndoManager(chapterIds.map(id => passage(doc, id)), { trackedOrigins: new Set([origin]) });
}

export function setRuby(doc, { id = crypto.randomUUID(), chapterId, pane = 'translation', start, end, reading, published = false }, origin) {
  if (typeof reading !== 'string' || !reading.trim() || reading.length > 500) throw new Error('Ruby must contain between 1 and 500 characters.');
  if (typeof id !== 'string' || !id || typeof chapterId !== 'string' || !chapterId) throw new Error('Invalid ruby identity.');
  const text = passage(doc, chapterId, pane);
  const ruby = { id, chapterId, pane, reading: reading.trim(), published: published === true, anchor: anchorRange(text, start, end) };
  doc.transact(() => doc.getMap('ruby').set(id, ruby), origin);
  return id;
}

export function removeRuby(doc, id, origin) {
  doc.transact(() => doc.getMap('ruby').delete(id), origin);
}

export function updateRuby(doc, id, reading, origin) {
  const existing=doc.getMap('ruby').get(id);
  if(!existing)throw new Error('This ruby has been deleted.');
  if(typeof reading!=='string'||!reading.trim()||reading.length>500)throw new Error('Ruby must contain between 1 and 500 characters.');
  doc.transact(()=>doc.getMap('ruby').set(id,{...existing,reading:reading.trim()}),origin);
}

export function rubyForPassage(doc, chapterId, pane = 'translation', { publishedOnly = false } = {}) {
  return [...doc.getMap('ruby').values()]
    .filter(ruby => ruby.chapterId === chapterId && ruby.pane === pane && (!publishedOnly || ruby.published === true))
    .map(ruby => ({ ...ruby, location: resolveAnchor(doc, ruby.anchor) }));
}

// Explicit public projection: never serialize the working CRDT into reader data.
export function publishedRuby(doc, chapterId, pane = 'translation') {
  return rubyForPassage(doc, chapterId, pane, { publishedOnly: true })
    .filter(ruby => ruby.location.status === 'attached')
    .map(ruby => ({ start: ruby.location.start, end: ruby.location.end, reading: ruby.reading }));
}
