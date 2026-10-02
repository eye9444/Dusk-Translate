import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { createDocumentSeed, openSharedDocument, passage, replaceRange, anchorRange, resolveAnchor, createLocalUndo, setRuby, updateRuby, removeRuby, rubyForPassage, publishedRuby } from '../web/src/shared-document.js';

const seed = () => createDocumentSeed({ novel: { chapters: [{ id: 'one', text: 'Original' }] }, translations: { one: 'Hello world' } });
const sync = (a, b) => {
  const aUpdate = Y.encodeStateAsUpdate(a), bUpdate = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, bUpdate, 'remote'); Y.applyUpdate(b, aUpdate, 'remote');
};

test('editing ruby preserves its shared anchor and publication setting, then deletion syncs',()=>{
  const initial=seed(),a=openSharedDocument(initial),b=openSharedDocument(initial);
  try{
    setRuby(a,{id:'reading',chapterId:'one',start:0,end:5,reading:'before',published:true},'local');sync(a,b);
    const anchor=JSON.parse(JSON.stringify(rubyForPassage(a,'one')[0].anchor));
    updateRuby(a,'reading','after','local');sync(a,b);
    const changed=rubyForPassage(b,'one')[0];
    assert.equal(changed.reading,'after');assert.equal(changed.published,true);assert.deepEqual(changed.anchor,anchor);
    assert.throws(()=>updateRuby(a,'reading',' ','local'));
    removeRuby(a,'reading','local');sync(a,b);assert.deepEqual(rubyForPassage(b,'one'),[]);
    assert.throws(()=>updateRuby(a,'reading','resurrect','local'));
  }finally{a.destroy();b.destroy();}
});

test('ruby is shared but reference-only by default and outdated ruby is not published', () => {
  const initial = seed(), a = openSharedDocument(initial), b = openSharedDocument(initial);
  try {
    const fields = { id: 'ruby-one', chapterId: 'one', start: 0, end: 5, reading: '<script>reference</script>' };
    setRuby(a, fields, 'local'); sync(a, b);
    assert.equal(rubyForPassage(b, 'one')[0].reading, fields.reading);
    assert.deepEqual(publishedRuby(b, 'one'), []);
    setRuby(a, { ...fields, published: true }, 'local'); sync(a, b);
    assert.deepEqual(publishedRuby(b, 'one'), [{ start: 0, end: 5, reading: fields.reading }]);
    replaceRange(passage(b, 'one'), 2, 3, 'L', 'local'); sync(a, b);
    assert.equal(rubyForPassage(a, 'one')[0].location.status, 'needs-review');
    assert.deepEqual(publishedRuby(a, 'one'), []);
  } finally { a.destroy(); b.destroy(); }
});

test('disconnected concurrent edits converge and replay is idempotent', () => {
  const initial = seed(), a = openSharedDocument(initial), b = openSharedDocument(initial);
  try {
    replaceRange(passage(a, 'one'), 5, 5, ' Alice', 'local');
    replaceRange(passage(b, 'one'), 5, 5, ' Bob', 'local');
    sync(a, b); sync(a, b);
    assert.equal(passage(a, 'one').toString(), passage(b, 'one').toString());
    assert.match(passage(a, 'one').toString(), /Alice/);
    assert.match(passage(a, 'one').toString(), /Bob/);
    assert.equal((passage(a, 'one').toString().match(/Hello/g) || []).length, 1);
  } finally { a.destroy(); b.destroy(); }
});

test('anchors follow remote insertions and flag changed or deleted text', () => {
  const initial = seed(), a = openSharedDocument(initial), b = openSharedDocument(initial);
  try {
    const anchor = anchorRange(passage(a, 'one'), 6, 11);
    replaceRange(passage(b, 'one'), 0, 0, 'Dear ', 'local'); sync(a, b);
    assert.deepEqual(resolveAnchor(a, anchor), { start: 11, end: 16, quote: 'world', status: 'attached' });
    replaceRange(passage(a, 'one'), 13, 14, 'R', 'local');
    assert.equal(resolveAnchor(a, anchor).status, 'needs-review');
    replaceRange(passage(a, 'one'), 11, 16, '', 'local');
    assert.equal(resolveAnchor(a, anchor).status, 'unanchored');
  } finally { a.destroy(); b.destroy(); }
});

test('local undo preserves a remote collaborators edit', () => {
  const initial = seed(), a = openSharedDocument(initial), b = openSharedDocument(initial), origin = {};
  const undo = createLocalUndo(a, ['one'], origin);
  try {
    replaceRange(passage(a, 'one'), 0, 0, 'Mine ', origin);
    replaceRange(passage(b, 'one'), 11, 11, ' theirs', 'local'); sync(a, b);
    undo.undo(); sync(a, b);
    assert.equal(passage(a, 'one').toString(), 'Hello world theirs');
    assert.equal(passage(a, 'one').toString(), passage(b, 'one').toString());
  } finally { undo.destroy(); a.destroy(); b.destroy(); }
});
