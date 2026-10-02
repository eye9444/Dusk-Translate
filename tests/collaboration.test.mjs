import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentSeed } from '../web/src/shared-document.js';
import { startCollaboration } from '../web/src/collaboration.js';

const project=()=>({id:'project-one',snapshot:{novel:{chapters:[{id:'one',text:'Source'}]},translations:{one:'Hello'}}});
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

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
