/* Selectable review tools use plain-text offsets shared by search and presence. */
(() => {
  let selection = null;
  const comments = document.createElement('button'); comments.id = 'host-comments'; comments.type = 'button'; comments.textContent = 'Comments';
  const ruby = document.createElement('button'); ruby.id = 'host-ruby'; ruby.type = 'button'; ruby.textContent = 'Ruby text';
  const rubyNotes = document.createElement('div'); rubyNotes.id = 'ruby-notes'; rubyNotes.className = 'ruby-notes'; rubyNotes.hidden = true;
  const rubyOverlay=document.createElement('div');rubyOverlay.className='ruby-overlay';
  const rubyEditor=document.createElement('form');rubyEditor.className='inline-ruby-editor';rubyEditor.hidden=true;
  const rubyInput=document.createElement('input');rubyInput.setAttribute('aria-label','Edit ruby reading');rubyInput.maxLength=500;rubyInput.required=true;
  const rubySave=document.createElement('button');rubySave.type='submit';rubySave.textContent='Save';
  const rubyDelete=document.createElement('button');rubyDelete.type='button';rubyDelete.textContent='Delete';
  const rubyCancel=document.createElement('button');rubyCancel.type='button';rubyCancel.textContent='Cancel';rubyCancel.onclick=()=>{rubyEditor.hidden=true;};
  rubyEditor.append(rubyInput,rubySave,rubyDelete,rubyCancel);document.body.append(rubyEditor);
  let editingRubyId=null;
  function editRuby(item,node){if(!canEdit)return;editingRubyId=item.id;rubyInput.value=item.reading;const box=node.getBoundingClientRect();rubyEditor.hidden=false;rubyEditor.style.left=`${Math.max(8,Math.min(innerWidth-rubyEditor.offsetWidth-8,box.left))}px`;rubyEditor.style.top=`${Math.max(8,Math.min(innerHeight-rubyEditor.offsetHeight-8,box.bottom+4))}px`;selectionTools.hidden=true;rubyInput.focus();rubyInput.select();}
  rubyEditor.onsubmit=event=>{event.preventDefault();if(!canEdit||!rubyInput.value.trim())return;send('editor:action',{action:'updateRuby',rubyId:editingRubyId,reading:rubyInput.value});rubyEditor.hidden=true;};
  rubyDelete.onclick=()=>{if(!canEdit)return;send('editor:action',{action:'removeRuby',rubyId:editingRubyId});rubyEditor.hidden=true;};
  rubyEditor.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();rubyEditor.hidden=true;}});
  document.addEventListener('dusk:chapter',()=>{rubyEditor.hidden=true;});
  document.addEventListener('scroll',event=>{if(['src-txt','tl-out'].includes(event.target.id))rubyEditor.hidden=true;},true);
  document.addEventListener('pointerdown',event=>{if(!rubyEditor.contains(event.target)&&!event.target.closest('.inline-ruby-reading'))rubyEditor.hidden=true;});
  const commentGutter=document.createElement('div');commentGutter.className='comment-gutter';
  const selectionTools=document.createElement('div');selectionTools.className='selection-tools';selectionTools.hidden=true;
  const selectionRuby=document.createElement('button');selectionRuby.type='button';selectionRuby.textContent='Ruby';selectionRuby.setAttribute('aria-label','Add ruby text to selection');selectionTools.append(selectionRuby);
  document.body.append(rubyNotes,rubyOverlay,commentGutter,selectionTools); toolMenu.append(comments,ruby);
  let commentThreads=[],rubyAnnotations=[],hoverLine=null,hoverClearTimer=null;
  const rubyByChapter=new Map();
  const rubyClose=document.createElement('button');rubyClose.type='button';rubyClose.textContent='Close';rubyClose.onclick=()=>{rubyNotes.hidden=true;};
  const selectionForRange=(range,pane,root)=>{const preceding=document.createRange();preceding.selectNodeContents(root);preceding.setEnd(range.startContainer,range.startOffset);const start=preceding.toString().length,end=start+range.toString().length,text=root.textContent;if(end<=start||end-start>2000)return null;return {chapterId:novel.chapters[cur].id,pane,start,end,quote:text.slice(start,end),prefix:text.slice(Math.max(0,start-48),start),suffix:text.slice(end,end+48)};};
  function lineAt(root,pane,offset){const text=root.textContent,start=text.lastIndexOf('\n',Math.max(0,offset-1))+1,next=text.indexOf('\n',offset),end=next<0?text.length:next;if(end<=start)return null;return {chapterId:novel.chapters[cur].id,pane,start,end,quote:text.slice(start,end),prefix:text.slice(Math.max(0,start-48),start),suffix:text.slice(end,end+48)};}
  const scheduleHoverClear=()=>{clearTimeout(hoverClearTimer);hoverClearTimer=setTimeout(()=>{if(commentGutter.querySelector(':hover')||commentGutter.contains(document.activeElement))return;hoverLine=null;renderCommentGutter();},240);};
  function marker(selection,count=0,hover=false){const root=document.getElementById(selection.pane==='source'?'src-txt':'tl-out'),range=textRange(root,selection.start,selection.end);if(!range)return null;const rect=range.getClientRects()[0]||range.getBoundingClientRect(),pane=root.closest('.pane').getBoundingClientRect(),button=document.createElement('button'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');button.type='button';button.className=`line-comment${hover?' is-hover':''}${count?' has-comments':''}`;button.style.left=`${pane.right-67}px`;button.style.top=`${Math.max(pane.top+38,rect.top)}px`;button.setAttribute('aria-label',count?`${count} comments on this line`:'Comment on this line');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M5 5.5h14v10H9.5L5 19.5v-14Z');svg.append(path);button.append(svg);if(count)button.dataset.count=String(count);button.onpointerenter=()=>clearTimeout(hoverClearTimer);button.onpointerleave=scheduleHoverClear;button.onclick=()=>send('editor:action',{action:'comments',selection});return button;}
  function renderCommentGutter(){
    if(!novel)return;
    const chapterId=novel.chapters[cur].id,groups=new Map();
    for(const thread of commentThreads.filter(item=>!item.resolved&&item.anchor?.chapterId===chapterId)){
      const anchor=thread.anchor,key=`${anchor.pane}:${anchor.start}:${anchor.end}`,entry=groups.get(key)||{anchor,count:0};entry.count+=(thread.messages?.length||1);groups.set(key,entry);
    }
    if(hoverLine){const key=`${hoverLine.pane}:${hoverLine.start}:${hoverLine.end}`;if(!groups.has(key))groups.set(key,{anchor:hoverLine,count:0});}
    const retained=new Set();
    for(const [key,entry] of groups){
      const candidate=marker(entry.anchor,entry.count,!entry.count);if(!candidate)continue;
      const identity=`${chapterId}:${key}:${entry.count}`;
      const existing=[...commentGutter.children].find(node=>node.dataset.key===identity);
      if(existing){existing.style.cssText=candidate.style.cssText;retained.add(existing);}
      else{candidate.dataset.key=identity;commentGutter.append(candidate);retained.add(candidate);}
    }
    for(const node of [...commentGutter.children])if(!retained.has(node))node.remove();
  }
  function renderRubyOverlay(){
    if(!novel)return;
    const retained=new Set();
    for(const item of rubyAnnotations.filter(item=>item.chapterId===novel.chapters[cur].id&&item.location?.status!=='unanchored')){
      const root=document.getElementById(item.pane==='source'?'src-txt':'tl-out'),range=textRange(root,item.location.start,item.location.end);if(!range)continue;
      const rect=range.getClientRects()[0]||range.getBoundingClientRect(),bounds=root.getBoundingClientRect();if(rect.top<bounds.top+10||rect.top>bounds.bottom)continue;
      let reading=[...rubyOverlay.children].find(node=>node.dataset.id===item.id);
      if(!reading){reading=document.createElement('button');reading.type='button';reading.className='inline-ruby-reading';reading.dataset.id=item.id;rubyOverlay.append(reading);}
      reading.textContent=item.reading;reading.disabled=!canEdit;reading.setAttribute('aria-label',`Edit ruby: ${item.reading}`);reading.onclick=()=>editRuby(item,reading);reading.style.left=`${rect.left+rect.width/2}px`;reading.style.top=`${rect.top}px`;retained.add(reading);
    }
    for(const node of [...rubyOverlay.children])if(!retained.has(node))node.remove();
    if(!rubyEditor.hidden&&![...retained].some(node=>node.dataset.id===editingRubyId))rubyEditor.hidden=true;
  }
  function capture() {
    const selected = getSelection();
    if (!novel || !selected?.rangeCount || selected.isCollapsed) return;
    const range = selected.getRangeAt(0);
    for (const [pane, id] of [['source','src-txt'], ['translation','tl-out']]) {
      const root = document.getElementById(id);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) continue;
      selection=selectionForRange(range,pane,root);if(!selection)return;
      const box=range.getBoundingClientRect();selectionTools.style.left=`${Math.min(innerWidth-80,box.right+8)}px`;selectionTools.style.top=`${Math.max(8,box.top-8)}px`;selectionTools.hidden=false;
    }
  }
  document.addEventListener('selectionchange',()=>{if(getSelection()?.isCollapsed)selectionTools.hidden=true;capture();});
  for(const [pane,id] of [['source','src-txt'],['translation','tl-out']]){const root=document.getElementById(id);root.addEventListener('mousemove',event=>{clearTimeout(hoverClearTimer);const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);if(!range||!root.contains(range.startContainer))return;const preceding=document.createRange();preceding.selectNodeContents(root);preceding.setEnd(range.startContainer,range.startOffset);hoverLine=lineAt(root,pane,preceding.toString().length);renderCommentGutter();});root.addEventListener('mouseleave',scheduleHoverClear);root.addEventListener('scroll',()=>{renderCommentGutter();renderRubyOverlay();});}
  addEventListener('resize',()=>{renderCommentGutter();renderRubyOverlay();});
  document.addEventListener('dusk:chapter', () => { selection = null;hoverLine=null;selectionTools.hidden=true; comments.hidden = !canEdit; ruby.hidden = !canEdit; rubyNotes.hidden=true; rubyOverlay.replaceChildren();renderCommentGutter();globalThis.CSS?.highlights?.delete('dusk-comment'); });
  comments.onclick = () => { closeToolMenu(); send('editor:action', { action: 'comments', selection }); };
  ruby.onclick = () => { closeToolMenu();if(!selection&&rubyNotes.childElementCount>1){rubyNotes.hidden=!rubyNotes.hidden;return;}send('editor:action', { action: 'ruby', selection }); };
  selectionRuby.onclick=()=>{selectionTools.hidden=true;send('editor:action',{action:'ruby',selection});};
  window.addEventListener('message', event => {
    if(event.origin===location.origin&&event.source===parent&&event.data?.type==='host:comments'&&event.data.projectId===projectId){commentThreads=Array.isArray(event.data.threads)?event.data.threads:[];renderCommentGutter();return;}
    if(event.origin===location.origin&&event.source===parent&&event.data?.type==='host:ruby'&&event.data.projectId===projectId){
      const incoming=Array.isArray(event.data.annotations)?event.data.annotations:[];
      const chapterId=event.data.chapterId||incoming[0]?.chapterId||novel?.chapters[cur]?.id;
      rubyByChapter.set(chapterId,incoming);
      rubyAnnotations=[...rubyByChapter.values()].flat();
      const current=rubyAnnotations.filter(item=>item.chapterId===novel?.chapters[cur]?.id&&item.location?.status!=='unanchored');
      rubyNotes.replaceChildren(...current.map(item=>{const row=document.createElement('div'),text=document.createElement('span'),remove=document.createElement('button');text.textContent=`${item.location.quote} · ${item.reading}${item.published?' · published':''}`;remove.type='button';remove.textContent='Remove';remove.onclick=()=>send('editor:action',{action:'removeRuby',rubyId:item.id});row.append(text,remove);return row;}));
      rubyNotes.append(rubyClose);if(!current.length)rubyNotes.hidden=true;renderRubyOverlay();return;
    }
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
