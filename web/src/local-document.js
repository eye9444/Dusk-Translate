import * as Y from 'yjs';
import { createDocumentSeed, openSharedDocument, passage, replaceRange, anchorRange, resolveAnchor, setRuby, removeRuby, updateRuby, rubyForPassage, publishedRuby } from './shared-document.js';

function commonEdit(previous,next){let start=0;while(start<previous.length&&start<next.length&&previous[start]===next[start])start++;let oldEnd=previous.length,newEnd=next.length;while(oldEnd>start&&newEnd>start&&previous[oldEnd-1]===next[newEnd-1]){oldEnd--;newEnd--;}return {start,end:oldEnd,replacement:next.slice(start,newEnd)};}

export function startLocalDocument({project,onText,onRuby=()=>{},onPersist}){
  const origin={},seed=project.localDocument instanceof Uint8Array?project.localDocument:createDocumentSeed(project.snapshot);
  const doc=openSharedDocument(seed);let stopped=false,persistTask=Promise.resolve();
  const notify=()=>{for(const chapter of project.snapshot.novel.chapters){onText(chapter.id,passage(doc,chapter.id).toString());onRuby(chapter.id,rubyForPassage(doc,chapter.id));}};
  const persist=()=>{if(stopped)return;const bytes=Y.encodeStateAsUpdate(doc);project.localDocument=bytes;persistTask=persistTask.catch(()=>{}).then(()=>onPersist(bytes));};
  doc.on('update',(_update,updateOrigin)=>{if(updateOrigin===origin){persist();notify();}});notify();
  return {
    edit(chapterId,value){const text=passage(doc,chapterId),previous=text.toString();if(previous===value)return;const edit=commonEdit(previous,value);replaceRange(text,edit.start,edit.end,edit.replacement,origin);},
    editSource(chapterId,value){const text=passage(doc,chapterId,'source'),previous=text.toString();if(previous===value)return;const edit=commonEdit(previous,value);replaceRange(text,edit.start,edit.end,edit.replacement,origin);},
    addRuby(selection,reading,published=false){return setRuby(doc,{...selection,reading,published},origin);},
    removeRuby(id){removeRuby(doc,id,origin);},updateRuby(id,reading){updateRuby(doc,id,reading,origin);},
    ruby(chapterId){return [...rubyForPassage(doc,chapterId),...rubyForPassage(doc,chapterId,'source')];},
    publishedRuby(chapterId){return publishedRuby(doc,chapterId);},
    anchor(selection){return {...selection,crdt:anchorRange(passage(doc,selection.chapterId,selection.pane),selection.start,selection.end)};},
    resolve(anchor){return anchor?.crdt?resolveAnchor(doc,anchor.crdt):null;},text(chapterId){return passage(doc,chapterId).toString();},
    async flush(){persist();await persistTask;},stop(){stopped=true;doc.destroy();}
  };
}
