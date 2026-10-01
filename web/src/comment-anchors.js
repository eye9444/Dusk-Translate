export function makeCommentAnchor(chapterId, pane, text, start, end) {
  if (!['source', 'translation'].includes(pane) || typeof chapterId !== 'string' || !chapterId || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length || end - start > 2000) throw new Error('Select between 1 and 2,000 characters in a text pane.');
  return { chapterId, pane, start, end, quote: text.slice(start, end), prefix: text.slice(Math.max(0, start - 48), start), suffix: text.slice(end, end + 48) };
}

// Quote/context fallback also supports legacy projects without CRDT anchors.
export function locateCommentAnchor(anchor, text) {
  if (!anchor?.quote || typeof text !== 'string') return null;
  const candidates = [];
  let offset = 0;
  while (offset <= text.length) {
    const start = text.indexOf(anchor.quote, offset);
    if (start < 0) break;
    const end = start + anchor.quote.length;
    const contextual = (!anchor.prefix || text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix)
      && (!anchor.suffix || text.slice(end, end + anchor.suffix.length) === anchor.suffix);
    candidates.push({ start, end, contextual });
    offset = start + 1;
  }
  const contextual = candidates.filter(item => item.contextual);
  const match = contextual.length === 1 ? contextual[0] : candidates.length === 1 ? candidates[0] : null;
  return match ? { start: match.start, end: match.end } : null;
}
