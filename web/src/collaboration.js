import * as Y from 'yjs';
import { createDocumentSeed, openSharedDocument, passage, replaceRange, anchorRange, resolveAnchor, setRuby, removeRuby, updateRuby, rubyForPassage, publishedRuby } from './shared-document.js';

const POLL_INTERVAL = 5000;

function commonEdit(previous, next) {
  let start=0;
  while(start<previous.length&&start<next.length&&previous[start]===next[start])start++;
  let oldEnd=previous.length,newEnd=next.length;
  while(oldEnd>start&&newEnd>start&&previous[oldEnd-1]===next[newEnd-1]){oldEnd--;newEnd--;}
  return {start,end:oldEnd,replacement:next.slice(start,newEnd)};
}

export async function startCollaboration({project,local,remote,onText,onRuby=()=>{},onStatus=()=>{},pendingTranslations=()=>[],pollInterval=POLL_INTERVAL}) {
  const localOrigin={},remoteOrigin='remote';
  const canonical=await remote.initializeDocument(project.id,createDocumentSeed(project.snapshot));
  const doc=openSharedDocument(canonical instanceof Uint8Array?canonical:new Uint8Array(canonical));
  let stopped=false,pollTimer,lastCreatedAt=null,uploadTask=null,connectionStatus='',queueTask=Promise.resolve();
  const applied=new Set();
  const reportStatus=message=>{if(connectionStatus===message)return;connectionStatus=message;onStatus(message);};

  const notify=()=>{
    for(const chapter of project.snapshot.novel.chapters){
      const value=passage(doc,chapter.id).toString();
      onText(chapter.id,value);
      onRuby(chapter.id,rubyForPassage(doc,chapter.id));
    }
  };
  const applyRows=rows=>{
    for(const row of rows){
      if(applied.has(row.operationId))continue;
      Y.applyUpdate(doc,row.payload,remoteOrigin);applied.add(row.operationId);
      if(!lastCreatedAt||row.createdAt>lastCreatedAt)lastCreatedAt=row.createdAt;
    }
  };
  applyRows(await remote.documentUpdates(project.id));
  for(const pending of await local.documentUpdates(project.id))Y.applyUpdate(doc,new Uint8Array(pending.payload),remoteOrigin);

  async function flushOutbox(){
    if(stopped)return;
    if(uploadTask)return uploadTask;
    uploadTask=(async()=>{try{
      for(const update of await local.documentUpdates(project.id)){
        await remote.appendDocumentUpdate(project.id,update.operationId,new Uint8Array(update.payload));
        applied.add(update.operationId);await local.removeDocumentUpdate(update.operationId);
      }
      reportStatus('Live collaboration connected');
    }catch{reportStatus('Working offline - collaboration will reconnect');}
    finally{uploadTask=null;}})();
    return uploadTask;
  }
  const updateHandler=(update,origin)=>{
    if(origin!==localOrigin)return;
    const operationId=crypto.randomUUID();
    // Persist every edit independently of slow or stalled network uploads.
    queueTask=queueTask.catch(()=>{}).then(()=>local.queueDocumentUpdate(project.id,operationId,update)).then(()=>{void flushOutbox();}).catch(()=>{
      reportStatus('Could not save collaboration changes on this device. Download a project backup.');
    });
  };
  doc.on('update',updateHandler);
  // Replay edits made during startup before canonical text can replace the editor.
  for(const {chapterId,value} of pendingTranslations()){
    const text=passage(doc,chapterId),edit=commonEdit(text.toString(),value);
    replaceRange(text,edit.start,edit.end,edit.replacement,localOrigin);
  }
  await queueTask;
  notify();

  async function poll(){
    if(stopped)return;
    try{const rows=await remote.documentUpdates(project.id,lastCreatedAt);applyRows(rows);if(rows.length)notify();await flushOutbox();}
    catch{reportStatus('Working offline - collaboration will reconnect');}
    finally{if(!stopped)pollTimer=setTimeout(poll,pollInterval);}
  }
  pollTimer=setTimeout(poll,pollInterval);void flushOutbox();

  return {
    edit(chapterId,value){
      const text=passage(doc,chapterId),previous=text.toString();
      if(previous===value)return;
      const edit=commonEdit(previous,value);replaceRange(text,edit.start,edit.end,edit.replacement,localOrigin);
    },
    editSource(chapterId,value){
      const text=passage(doc,chapterId,'source'),previous=text.toString();if(previous===value)return;
      const edit=commonEdit(previous,value);replaceRange(text,edit.start,edit.end,edit.replacement,localOrigin);
    },
    addRuby(selection,reading,published=false){return setRuby(doc,{...selection,reading,published},localOrigin);},
    removeRuby(id){removeRuby(doc,id,localOrigin);notify();},
    updateRuby(id,reading){updateRuby(doc,id,reading,localOrigin);notify();},
    ruby(chapterId){return [...rubyForPassage(doc,chapterId),...rubyForPassage(doc,chapterId,'source')];},
    publishedRuby(chapterId){return publishedRuby(doc,chapterId);},
    anchor(selection){return {...selection,crdt:anchorRange(passage(doc,selection.chapterId,selection.pane),selection.start,selection.end)};},
    resolve(anchor){return anchor?.crdt?resolveAnchor(doc,anchor.crdt):null;},
    text(chapterId){return passage(doc,chapterId).toString();},
    async flush(){await queueTask.catch(()=>{});await flushOutbox();},
    stop(){stopped=true;clearTimeout(pollTimer);doc.off('update',updateHandler);doc.destroy();}
  };
}
