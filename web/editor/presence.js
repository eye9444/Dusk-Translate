/* Shares the adapter's lexical state; decorations never enter editable text. */
(() => {
  const avatars = document.createElement('div');
  avatars.id = 'collaborator-presence'; avatars.hidden = true;
  avatars.setAttribute('aria-label', 'Project collaborators');
  document.querySelector('.host-header-actions').prepend(avatars);
  const layer = document.createElement('div');
  layer.id = 'collaborator-cursors'; layer.setAttribute('aria-hidden','true');
  document.body.append(layer);
  let members = [], selfId = '', lastEdit = 0, frame = null;
  const fingerprint = text => {
    let hash = 2166136261;
    for (let i=0;i<text.length;i++) hash = Math.imul(hash ^ text.charCodeAt(i),16777619);
    return `${text.length}:${hash >>> 0}`;
  };
  const paneRoot = pane => document.getElementById(pane === 'source' ? 'src-txt' : 'tl-out');
  function localLocation() {
    const selection = getSelection();
    const pane = paneRoot('source').contains(selection?.focusNode) ? 'source' : 'translation';
    const root = paneRoot(pane);
    let offset = null;
    if (selection?.focusNode && root.contains(selection.focusNode)) {
      const range = document.createRange(); range.selectNodeContents(root);
      range.setEnd(selection.focusNode,selection.focusOffset); offset = range.toString().length;
    }
    return { chapter:novel?.chapters[cur]?.id || '', pane, offset,
      fingerprint:fingerprint(root.textContent), active:Date.now()-lastEdit<8000 || busy,
      visible:!document.hidden && document.hasFocus() };
  }
  function report() {
    if (readyForSave) send('editor:presence-location',{location:localLocation()});
    draw();
  }
  function draw() {
    layer.replaceChildren();
    if (!novel || busy) return;
    for (const member of members) {
      const state = member.location || {};
      if (member.user_id === selfId || !member.online || !state.visible || state.chapter !== novel.chapters[cur]?.id) continue;
      const root = paneRoot(state.pane);
      if (!Number.isSafeInteger(state.offset) || state.offset < 0 || state.offset > root.textContent.length || state.fingerprint !== fingerprint(root.textContent)) continue;
      const range = textRange(root,state.offset,state.offset);
      if (!range) continue;
      let box = range.getBoundingClientRect();
      if (!box.height && root.textContent.length) {
        const start = Math.max(0,state.offset-1);
        const adjacent = textRange(root,start,Math.min(root.textContent.length,start+1));
        if (!adjacent) continue;
        const rect = adjacent.getBoundingClientRect();
        box = {left:state.offset ? rect.right : rect.left,top:rect.top,bottom:rect.bottom,height:rect.height};
      }
      const viewport = root.getBoundingClientRect();
      if (!box.height || box.top < viewport.top || box.bottom > viewport.bottom || box.left < viewport.left || box.left > viewport.right) continue;
      const caret = document.createElement('span'); caret.className='collaborator-caret';
      caret.style.left=`${box.left}px`; caret.style.top=`${box.top}px`; caret.style.height=`${box.height}px`;
      const label=document.createElement('span'); label.textContent=member.display_name;
      caret.append(label); layer.append(caret);
    }
  }
  function scheduleDraw() {
    if (frame === null) frame=requestAnimationFrame(()=>{frame=null;draw();});
  }
  window.addEventListener('message',event=>{
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'host:presence') return;
    avatars.hidden=false; avatars.replaceChildren();
    selfId=event.data.selfId; members=event.data.members || [];
    if (event.data.unavailable) {
      const message=document.createElement('span'); message.className='presence-unavailable';
      message.textContent='Presence unavailable'; avatars.append(message);
    } else for (const member of members) {
      const active=member.online && member.location?.visible && member.location?.active;
      const status=member.online ? (active ? 'Editing' : 'Online') : 'Offline';
      const name=String(member.display_name || 'Collaborator');
      const avatar=document.createElement('span'); avatar.className='collaborator-avatar'; avatar.tabIndex=0;
      avatar.dataset.online=String(member.online); avatar.dataset.active=String(Boolean(active));
      avatar.textContent=name.trim().split(/\s+/).map(word=>Array.from(word)[0]).slice(0,2).join('').toUpperCase();
      const description=`${name}${member.user_id===selfId ? ' (you)' : ''}: ${status}`;
      avatar.title=description; avatar.setAttribute('aria-label',description); avatars.append(avatar);
    }
    draw();
  });
  document.addEventListener('selectionchange',scheduleDraw);
  document.addEventListener('input',event=>{
    if (paneRoot('translation').contains(event.target)) lastEdit=Date.now();
    scheduleDraw();
  });
  document.addEventListener('scroll',scheduleDraw,true);
  window.addEventListener('resize',scheduleDraw);
  window.addEventListener('focus',report); window.addEventListener('blur',report);
  document.addEventListener('visibilitychange',report);
  const interval=setInterval(report,500);
  window.addEventListener('pagehide',()=>clearInterval(interval));
})();
