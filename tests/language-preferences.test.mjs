import test from 'node:test';
import assert from 'node:assert/strict';
import { readLanguagePreference, storeLanguagePreference, needsLanguageSetup } from '../web/src/language-preferences.js';

const memory = () => {
  const values = new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
};
test('account language preferences take precedence and do not leak between identities',()=>{
  const storage=memory(),a={id:'a'},b={id:'b'};
  storeLanguagePreference(null,{sourceLanguage:'en',targetLanguage:'ko'},storage);
  storeLanguagePreference(a,{sourceLanguage:'ko',targetLanguage:'en'},storage);
  assert.deepEqual(readLanguagePreference(null,storage),{sourceLanguage:'en',targetLanguage:'ko'});
  assert.deepEqual(readLanguagePreference(a,storage),{sourceLanguage:'ko',targetLanguage:'en'});
  assert.deepEqual(readLanguagePreference(b,storage),{sourceLanguage:'ja',targetLanguage:'en'});
  a.user_metadata={translation_language_pair:{sourceLanguage:'en',targetLanguage:'zh-Hans'}};
  assert.deepEqual(readLanguagePreference(a,storage),a.user_metadata.translation_language_pair);
});
test('invalid preferences and unavailable storage leave a usable default',()=>{
  const storage=memory();storage.setItem('dusk-language-pair:guest','not json');
  assert.deepEqual(readLanguagePreference(null,storage),{sourceLanguage:'ja',targetLanguage:'en'});
  const blocked={getItem(){throw new Error('Unavailable');}};
  assert.deepEqual(readLanguagePreference(null,blocked),{sourceLanguage:'ja',targetLanguage:'en'});
  assert.deepEqual(readLanguagePreference({id:'bad',user_metadata:{translation_language_pair:{sourceLanguage:'__proto__',targetLanguage:'en'}}},storage),{sourceLanguage:'ja',targetLanguage:'en'});
});
test('language setup follows email confirmation and first Google registration',()=>{
  assert.equal(needsLanguageSetup({user_metadata:{dusk_language_setup_pending:true}}),true);
  assert.equal(needsLanguageSetup({created_at:'2026-10-29T12:00:00Z',last_sign_in_at:'2026-10-29T12:00:01Z'}),true);
  assert.equal(needsLanguageSetup({created_at:'2026-10-01T12:00:00Z',last_sign_in_at:'2026-10-29T12:00:01Z'}),false);
  assert.equal(needsLanguageSetup({user_metadata:{translation_language_pair:{sourceLanguage:'ko',targetLanguage:'en'}}}),false);
  assert.equal(needsLanguageSetup(null),false);
});
