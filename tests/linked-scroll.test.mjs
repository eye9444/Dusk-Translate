import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/editor/linked-scroll.js';
class Pane extends EventTarget {
  constructor(height) { super(); this.scrollHeight=height;this.clientHeight=100;this.scrollTop=0; }
  scroll(top) { this.dispatchEvent(new Event('wheel'));this.scrollTop=top;this.dispatchEvent(new Event('scroll')); }
}
test('linked scrolling is optional, bidirectional, proportional, and does not bounce',()=>{
  const jp=new Pane(1100),en=new Pane(2100);
  const controller=globalThis.DuskLinkedScroll(jp,en);
  jp.scroll(500);assert.equal(en.scrollTop,0);
  controller.setEnabled(true);assert.equal(en.scrollTop,1000);
  en.dispatchEvent(new Event('scroll'));assert.equal(jp.scrollTop,500);
  en.scroll(1500);assert.equal(jp.scrollTop,750);
  jp.dispatchEvent(new Event('scroll'));assert.equal(en.scrollTop,1500);
  controller.reset();assert.equal(jp.scrollTop,0);assert.equal(en.scrollTop,0);
  controller.setEnabled(false);en.scroll(700);assert.equal(jp.scrollTop,0);
  controller.destroy();
});
test('empty and non-scrolling panes do not cause division by zero or jumps',()=>{
  const jp=new Pane(100),en=new Pane(2100);
  const controller=globalThis.DuskLinkedScroll(jp,en,true);
  en.scroll(900);assert.equal(jp.scrollTop,0);
  jp.scroll(0);assert.equal(en.scrollTop,900);
  controller.destroy();
});
