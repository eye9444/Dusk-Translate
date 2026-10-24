import test from 'node:test';
import assert from 'node:assert/strict';
import { changeChapters } from '../web/src/chapter-actions.js';
import { progress,cleanSnapshot } from '../web/src/model.js';
const snapshot=()=>({novel:{chapters:[{id:'one',text:'source',xhtmlPath:'one.xhtml'},{id:'two',text:'source 2',xhtmlPath:'two.xhtml'}]},translations:{one:'Translation'}});
test('bulk completion preserves text and never completes empty chapters',()=>{
  const original=snapshot(),unfinished=changeChapters(original,['one','two'],'incomplete');
  assert.equal(progress(unfinished).done,0);assert.equal(unfinished.translations.one,'Translation');
  const complete=changeChapters(cleanSnapshot(unfinished),['one','two'],'complete');
  assert.equal(progress(complete).done,1);assert.equal(complete.unfinished.two,true);
  assert.equal(original.unfinished,undefined);
});
test('deletion removes translated state and retains export cleanup metadata',()=>{
  const result=changeChapters(snapshot(),['one'],'delete',{removeImages:true});
  assert.equal(result.novel.chapters.length,1);assert.equal(result.translations.one,undefined);
  assert.deepEqual(cleanSnapshot(result).deletedChapters,[{id:'one',xhtmlPath:'one.xhtml',removeImages:true}]);
  assert.throws(()=>changeChapters(result,['two'],'delete'),/at least one/);
});
