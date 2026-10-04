import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {createDocumentSeed,openSharedDocument,setRuby,updateRuby,removeRuby} from '../web/src/shared-document.js';
import {validateDocumentUpdate} from '../server/document-validation.js';

const seed=createDocumentSeed({novel:{chapters:[{id:'one',text:'Japanese'}]},translations:{one:'English'}});
function delta(doc,edit){const vector=Y.encodeStateVector(doc);edit();return Y.encodeStateAsUpdate(doc,vector);}

test('Free can edit text, but ruby creation requires a paid plan',()=>{
 const doc=openSharedDocument(seed);
 try {
  const text=delta(doc,()=>doc.getText('translation:one').insert(0,'New '));
  assert.doesNotThrow(()=>validateDocumentUpdate(seed,[],text,'free'));
  const ruby=delta(doc,()=>setRuby(doc,{id:'ruby',chapterId:'one',start:0,end:3,reading:'reading'}));
  assert.throws(()=>validateDocumentUpdate(seed,[text],ruby,'free'),/requires Pro/);
  assert.doesNotThrow(()=>validateDocumentUpdate(seed,[text],ruby,'pro'));
 }finally{doc.destroy();}
});

test('Free preserves existing ruby but cannot edit or delete it',()=>{
 const doc=openSharedDocument(seed);
 try{
  const ruby=delta(doc,()=>setRuby(doc,{id:'ruby',chapterId:'one',start:0,end:3,reading:'reading'}));
  const edit=delta(doc,()=>updateRuby(doc,'ruby','changed'));
  assert.throws(()=>validateDocumentUpdate(seed,[ruby],edit,'free'),/requires Pro/);
  const remove=delta(doc,()=>removeRuby(doc,'ruby'));
  assert.throws(()=>validateDocumentUpdate(seed,[ruby,edit],remove,'free'),/requires Pro/);
  const preserved=openSharedDocument(seed);
  try{
   Y.applyUpdate(preserved,ruby);
   const unchanged=Y.encodeStateAsUpdate(preserved,Y.encodeStateVector(preserved));
   assert.doesNotThrow(()=>validateDocumentUpdate(seed,[ruby],unchanged,'free'));
  }finally{preserved.destroy();}
 }finally{doc.destroy();}
});

test('incomplete update dependencies and metadata mutations fail closed',()=>{
 const doc=openSharedDocument(seed);
 try{
  delta(doc,()=>doc.getText('translation:one').insert(0,'First'));
  const dependent=delta(doc,()=>doc.getText('translation:one').insert(0,'Second'));
  assert.throws(()=>validateDocumentUpdate(seed,[],dependent,'pro'),/dependencies/);
  const invalid=delta(doc,()=>doc.getMap('metadata').set('version',2));
  assert.throws(()=>validateDocumentUpdate(seed,[Y.encodeStateAsUpdate(doc)],invalid,'pro'),/version/);
 }finally{doc.destroy();}
});
