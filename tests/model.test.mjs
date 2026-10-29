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
test('spellcheck defaults to true and respects false',()=>{
  const snap = cleanSnapshot({novel,translations:{one:'A'},spellcheck:false});
  assert.equal(snap.spellcheck,false);
  const defaultSnap = cleanSnapshot({novel,translations:{one:'A'}});
  assert.equal(defaultSnap.spellcheck,true);
});
test('language pairs default safely and reject unsupported production routes',()=>{
  assert.deepEqual(cleanSnapshot({novel,translations:{}}).sourceLanguage,'ja');
  const supported=cleanSnapshot({novel,translations:{},sourceLanguage:'en',targetLanguage:'ru'});
  assert.equal(supported.sourceLanguage,'en');assert.equal(supported.targetLanguage,'ru');
  const italian=cleanSnapshot({novel,translations:{},sourceLanguage:'ja',targetLanguage:'it'});
  assert.equal(italian.sourceLanguage,'ja');assert.equal(italian.targetLanguage,'it');
  for(const sourceLanguage of ['vi','ru','de','es','it','pt','ko','zh-Hans']){
    const reverse=cleanSnapshot({novel,translations:{},sourceLanguage,targetLanguage:'en'});
    assert.equal(reverse.sourceLanguage,sourceLanguage);assert.equal(reverse.targetLanguage,'en');
  }
  const unsupported=cleanSnapshot({novel,translations:{},sourceLanguage:'de',targetLanguage:'ja'});
  assert.equal(unsupported.sourceLanguage,'de');assert.equal(unsupported.targetLanguage,'en');
  for(const sourceLanguage of ['ja','en'])for(const targetLanguage of ['ko','zh-Hans']){
    const saved=cleanSnapshot({novel,translations:{one:'translated'},sourceLanguage,targetLanguage});
    const restored=cleanSnapshot(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.sourceLanguage,sourceLanguage);assert.equal(restored.targetLanguage,targetLanguage);assert.equal(restored.translations.one,'translated');
  }
});
test('upload boundaries are enforced',()=>{
  assert.throws(()=>validateFile({name:'book.exe',size:10}));
  assert.doesNotThrow(()=>validateFile({name:'book.epub',size:50*1024*1024}));
  assert.throws(()=>validateFile({name:'book.epub',size:50*1024*1024+1}));
  assert.doesNotThrow(()=>validateFile({name:'BOOK.EPUB',size:10}));
});
