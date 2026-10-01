/* Selectable review tools use plain-text offsets shared by search and presence. */
(() => {
  let selection = null;
  const comments = document.createElement('button'); comments.id = 'host-comments'; comments.type = 'button'; comments.textContent = 'Comments';
  toolMenu.append(comments);
  function capture() {
    const selected = getSelection();
    if (!novel || !selected?.rangeCount || selected.isCollapsed) return;
    const range = selected.getRangeAt(0);
    for (const [pane, id] of [['source','src-txt'], ['translation','tl-out']]) {
      const root = document.getElementById(id);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) continue;
      const preceding = document.createRange(); preceding.selectNodeContents(root); preceding.setEnd(range.startContainer, range.startOffset);
      const start = preceding.toString().length, end = start + range.toString().length, text = root.textContent;
      if (end <= start || end - start > 2000) { selection = null; return; }
      selection = { chapterId: novel.chapters[cur].id, pane, start, end, quote: text.slice(start,end), prefix: text.slice(Math.max(0,start-48),start), suffix: text.slice(end,end+48) };
    }
  }
  document.addEventListener('selectionchange', capture);
  document.addEventListener('dusk:chapter', () => { selection = null; comments.hidden = !canEdit; globalThis.CSS?.highlights?.delete('dusk-comment'); });
  comments.onclick = () => { closeToolMenu(); send('editor:action', { action: 'comments', selection }); };
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === parent && event.data?.type === 'host:clearComment' && event.data.projectId === projectId) globalThis.CSS?.highlights?.delete('dusk-comment');
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'host:commentFocus' || event.data.projectId !== projectId || busy) return;
    const target = event.data.selection, index = novel.chapters.findIndex(ch => ch.id === target?.chapterId);
    if (index < 0) return;
    if (index !== cur) selectCh(index);
    const root = document.getElementById(target.pane === 'source' ? 'src-txt' : 'tl-out');
    if (!['source', 'translation'].includes(target.pane) || !Number.isInteger(target.start) || !Number.isInteger(target.end) || target.start < 0 || target.end <= target.start || target.end > root.textContent.length || root.textContent.slice(target.start, target.end) !== target.quote) return;
    const range = textRange(root, target.start, target.end); if (!range) return;
    if (globalThis.CSS?.highlights) CSS.highlights.set('dusk-comment', new Highlight(range));
    const box = range.getBoundingClientRect(); root.scrollTop += box.top - root.getBoundingClientRect().top - root.clientHeight / 2;
  });
})();
