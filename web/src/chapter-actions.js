import { cleanSnapshot } from './model.js';

export function changeChapters(snapshot,ids,action,{removeImages=false}={}){
  const next=cleanSnapshot(snapshot),selected=new Set(ids);
  if(action==='delete'){
    const removed=next.novel.chapters.filter(ch=>selected.has(ch.id));
    if(removed.length===next.novel.chapters.length&&next.novel.projectType!=='web-novel')throw new Error('Keep at least one section in an EPUB project.');
    next.deletedChapters.push(...removed.filter(ch=>ch.xhtmlPath).map(ch=>({id:ch.id,xhtmlPath:ch.xhtmlPath,removeImages})));
    next.novel.chapters=next.novel.chapters.filter(ch=>!selected.has(ch.id));
  }else if(action==='complete'||action==='incomplete'){
    for(const ch of next.novel.chapters){
      if(!selected.has(ch.id))continue;
      if(action==='incomplete')next.unfinished[ch.id]=true;
      else if(next.translations[ch.id]?.trim()){
        delete next.unfinished[ch.id];next.translations[ch.id]=next.translations[ch.id].replace(/…PARTIAL$/u,'');delete next.partialResumes[ch.id];
      }
    }
  }else throw new Error('Unknown chapter action');
  return cleanSnapshot(next);
}
