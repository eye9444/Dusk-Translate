import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentSeed } from '../web/src/shared-document.js';
import { startCollaboration } from '../web/src/collaboration.js';

const project=()=>({id:'project-one',snapshot:{novel:{chapters:[{id:'one',text:'Source'}]},translations:{one:'Hello'}}});
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

test('startup replays pending translations before publishing canonical text',async()=>{
  const local=localStore(),seen=[],value='A full translated chapter. '.repeat(10000);
  const remote={async initializeDocument(){return createDocumentSeed(project().snapshot);},async documentUpdates(){return [];},async appendDocumentUpdate(){throw new Error('offline');}};
  const controller=await startCollaboration({project:project(),local,remote,pendingTranslations:()=>[{chapterId:'one',value}],onText:(_id,text)=>seen.push(text)});
  try{assert.deepEqual(seen,[value]);assert.equal(controller.text('one'),value);assert.equal(local.pending.length,1);}
  finally{controller.stop();}
});

test('stalled uploads do not block subsequent local edits',async()=>{
  const local=localStore();let release;
  const blocked=new Promise(resolve=>{release=resolve;});
  const remote={async initializeDocument(){return createDocumentSeed(project().snapshot);},async documentUpdates(){return [];},async appendDocumentUpdate(){await blocked;}};
  const controller=await startCollaboration({project:project(),local,remote,onText:()=>{}});
  try{
    controller.edit('one','First edit');await delay(10);
    controller.edit('one','Second edit');await delay(10);
    assert.equal(local.pending.length,2,'both edits must be durable while upload is blocked');
  }finally{release();await controller.flush();controller.stop();}
});

function localStore(){
  const pending=[];
  return {
    pending,
    async documentUpdates(projectId){return pending.filter(item=>item.projectId===projectId);},
    async queueDocumentUpdate(projectId,operationId,payload){pending.push({projectId,operationId,payload});},
    async removeDocumentUpdate(operationId){const index=pending.findIndex(item=>item.operationId===operationId);if(index>=0)pending.splice(index,1);}
  };
}

test('collaboration keeps failed updates durable and replays them after reconnect',async()=>{
  const rows=[],seed=createDocumentSeed(project().snapshot);let online=false;
  const remote={
    async initializeDocument(){return seed;},
    async documentUpdates(){return rows;},
    async appendDocumentUpdate(projectId,operationId,payload){
      if(!online)throw new Error('offline');
      if(!rows.some(row=>row.operationId===operationId))rows.push({operationId,payload,createdAt:new Date().toISOString()});
    }
  };
  const local=localStore(),seen=[];
  const first=await startCollaboration({project:project(),local,remote,onText:(id,value)=>seen.push([id,value]),pollInterval:20});
  first.edit('one','Hello offline');await first.flush();
  assert.equal(local.pending.length,1);
  first.stop();online=true;
  const restored=[];
  const second=await startCollaboration({project:project(),local,remote,onText:(id,value)=>restored.push([id,value]),pollInterval:20});
  await second.flush();await delay(25);
  assert.equal(second.text('one'),'Hello offline');
  assert.equal(local.pending.length,0);assert.equal(rows.length,1);
  assert.deepEqual(restored.at(-1),['one','Hello offline']);
  second.stop();
});

test('collaboration reports connection status only when it changes',async()=>{
  const seed=createDocumentSeed(project().snapshot),statuses=[];let online=true;
  const remote={
    async initializeDocument(){return seed;},
    async documentUpdates(){if(!online)throw new Error('offline');return[];},
    async appendDocumentUpdate(){}
  };
  const collaboration=await startCollaboration({project:project(),local:localStore(),remote,onText:()=>{},onStatus:message=>statuses.push(message),pollInterval:10});
  await delay(35);
  assert.deepEqual(statuses,['Live collaboration connected']);
  online=false;await delay(35);
  assert.deepEqual(statuses,['Live collaboration connected','Working offline - collaboration will reconnect']);
  online=true;await delay(35);
  assert.deepEqual(statuses,['Live collaboration connected','Working offline - collaboration will reconnect','Live collaboration connected']);
  collaboration.stop();
});
