import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { startLocalDocument } from '../web/src/local-document.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const snapshot={novel:{chapters:[{id:'one',text:'source'}]},translations:{one:'Tokyo is here.'}};

test('local ruby and text edits persist and reopen from one document update',async()=>{
  const project={snapshot};let persisted;
  const controller=startLocalDocument({project,onText:()=>{},onPersist:bytes=>{persisted=bytes;}});
  controller.addRuby({chapterId:'one',pane:'translation',start:0,end:5},'とうきょう',true);
  controller.edit('one','Tokyo was here.');
  await controller.flush();controller.stop();
  assert.ok(persisted instanceof Uint8Array);
  const reopened=startLocalDocument({project:{snapshot,localDocument:persisted},onText:()=>{},onPersist:()=>{}});
  assert.equal(reopened.text('one'),'Tokyo was here.');
  assert.deepEqual(reopened.publishedRuby('one'),[{start:0,end:5,reading:'とうきょう'}]);
  reopened.stop();
});
