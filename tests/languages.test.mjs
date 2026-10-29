import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSLATION_TARGETS, isSupportedLanguagePair, epubLanguageCode } from '../web/src/languages.js';

test('production exposes exactly the approved twenty-five translation routes',()=>{
  const routes=Object.entries(TRANSLATION_TARGETS).flatMap(([source,targets])=>targets.map(target=>`${source}-${target}`));
  assert.deepEqual(routes,['ja-en','ja-vi','ja-ru','ja-de','ja-es','ja-it','ja-pt','ja-ko','ja-zh-Hans','en-vi','en-ru','en-de','en-es','en-it','en-pt','en-ko','en-zh-Hans','vi-en','ru-en','de-en','es-en','it-en','pt-en','ko-en','zh-Hans-en']);
  assert.equal(isSupportedLanguagePair('en','ja'),false);
  assert.equal(isSupportedLanguagePair('de','en'),true);
  assert.equal(isSupportedLanguagePair('de','es'),false);
  assert.equal(isSupportedLanguagePair('ko','ja'),false);
  assert.equal(isSupportedLanguagePair('zh-Hant','en'),false);
});
test('EPUB language tags preserve the Chinese script rather than treating Traditional Chinese as Simplified',()=>{
  for(const tag of ['zh','zh_CN','zh-SG','zh-Hans','zh-Hans-CN'])assert.equal(epubLanguageCode(tag),'zh-Hans');
  assert.equal(epubLanguageCode('zh-Hant-TW'),'zh-hant-tw');
  assert.equal(epubLanguageCode('ko-KR'),'ko');
});
