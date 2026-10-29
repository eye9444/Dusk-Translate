import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('public pages expose canonical crawl and product metadata',()=>{
  const home=read('web/index.html');
  const features=read('web/features.html');
  assert.match(home,/rel="canonical" href="https:\/\/www\.dusktranslate\.com\/"/);
  assert.match(home,/"@type":"WebApplication"/);
  assert.match(home,/Japanese-to-English book translation/);
  assert.match(home,/property="og:image" content="https:\/\/www\.dusktranslate\.com\/brand\/novel-suite-social\.png"/);
  assert.match(features,/rel="canonical" href="https:\/\/www\.dusktranslate\.com\/features\.html"/);
  assert.match(features,/Japanese to English/);
  assert.match(features,/Vietnamese, Russian, German, Spanish, Italian, Portuguese, Korean, and Simplified Chinese/);
});

test('sitemap and robots publish the same canonical feature routes',()=>{
  const sitemap=read('web/public/sitemap.xml');
  const robots=read('web/public/robots.txt');
  for(const route of ['/','/features.html','/guides/api-keys.html']) {
    assert.ok(sitemap.includes(`https://www.dusktranslate.com${route}`));
  }
  assert.match(robots,/Sitemap: https:\/\/www\.dusktranslate\.com\/sitemap\.xml/);
});
