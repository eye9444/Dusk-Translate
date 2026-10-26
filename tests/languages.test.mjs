import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSLATION_TARGETS, isSupportedLanguagePair } from '../web/src/languages.js';

test('production exposes exactly the approved nineteen translation routes',()=>{
  const routes=Object.entries(TRANSLATION_TARGETS).flatMap(([source,targets])=>targets.map(target=>`${source}-${target}`));
  assert.deepEqual(routes,['ja-en','ja-vi','ja-ru','ja-de','ja-es','ja-it','ja-pt','en-vi','en-ru','en-de','en-es','en-it','en-pt','vi-en','ru-en','de-en','es-en','it-en','pt-en']);
  assert.equal(isSupportedLanguagePair('en','ja'),false);
  assert.equal(isSupportedLanguagePair('de','en'),true);
  assert.equal(isSupportedLanguagePair('de','es'),false);
});
