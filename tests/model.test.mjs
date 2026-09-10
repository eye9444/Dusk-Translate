import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSnapshot, validateFile, validateNovel, progress } from '../web/src/model.js';
const novel = { chapters:[{id:'one',text:'Hello'},{id:'two',text:'World'}] };
test('project serialization excludes keys and log payloads', () => {
  const s = cleanSnapshot({ novel:{...novel,apiKey:'SECRET'},apiKey:'SECRET',devLog:['SECRET'],translations:{one:'A',unrelated:'SECRET'},cur:99,glossary:'a=b',style:'invalid' });
  assert.equal(JSON.stringify(s).includes('SECRET'),false);
  assert.equal(s.cur,1);assert.equal(s.style,'natural');
});
test('partial chapters do not count as complete',()=>assert.deepEqual(progress(cleanSnapshot({novel,translations:{one:'done',two:'partial…PARTIAL'}})),{total:2,done:1,percent:50}));
test('rejects invalid and duplicate chapter identifiers',()=>{
  assert.throws(()=>validateNovel({chapters:[]}));
  assert.throws(()=>validateNovel({chapters:[{id:'__proto__',text:'bad'}]}));
  assert.throws(()=>validateNovel({chapters:[{id:'same',text:'a'},{id:'same',text:'b'}]}));
});
test('upload boundaries are enforced',()=>{
  assert.throws(()=>validateFile({name:'book.exe',size:10}));
  assert.throws(()=>validateFile({name:'book.epub',size:21*1024*1024}));
  assert.doesNotThrow(()=>validateFile({name:'BOOK.EPUB',size:10}));
});
