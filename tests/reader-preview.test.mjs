import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import sharp from 'sharp';
import {epubPreviewCover,readerPreviewHtml,composeReaderCover} from '../server/reader-preview.js';
import {createReaderHandler} from '../api/reader.js';

const token='12345678-1234-1234-1234-123456789abc';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=','base64');
const template='<html><head><title>Old</title><meta property="og:image" content="hero.png"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">{}</script></head><body><script type="module" src="/assets/app.js"></script></body></html>';
test('wide preview preserves the full portrait over a dark backdrop',async()=>{
  const bytes=await sharp({create:{width:400,height:600,channels:3,background:'#ffffff'}}).png().toBuffer();
  const result=await composeReaderCover({bytes});
  const metadata=await sharp(result.bytes).metadata();
  assert.equal(metadata.width,1200);assert.equal(metadata.height,630);assert.equal(metadata.format,'jpeg');
  const {data}=await sharp(result.bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.ok(data[(315*1200+600)*3]>240);
  assert.ok(data[(315*1200+10)*3]<150);
  assert.equal(await composeReaderCover(null),null);
  const html=readerPreviewHtml(template,{token,project:{title:'Book'},cover:result});
  assert.ok(html.includes('og:image:width'));assert.ok(html.includes('layout=wide'));
});
async function book(mode='3',image=png){
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  zip.file('OPS/book.opf',`<package><metadata>${mode==='2'?'<meta name="cover" content="art"/>':''}</metadata><manifest><item id="art" href="images/cover.png" media-type="image/png" ${mode==='3'?'properties="cover-image"':''}/></manifest>${mode==='guide'?'<guide><reference type="cover" href="cover.xhtml"/></guide>':''}</package>`);
  zip.file('OPS/cover.xhtml','<html><body><img src="images/cover.png"/></body></html>');
  zip.file('OPS/images/cover.png',image);
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
for(const mode of ['2','3','guide'])test(`extracts EPUB ${mode} cover`,async()=>{
  const result=await epubPreviewCover(await book(mode));
  assert.equal(result.type,'image/png');assert.deepEqual(result.bytes,png);
});
test('rejects disguised and oversized cover images',async()=>{
  assert.equal(await epubPreviewCover(await book('3',Buffer.from('<script>bad</script>'))),null);
  await assert.rejects(epubPreviewCover(await book('3',Buffer.alloc(4*1024*1024+1))),/too large/);
});
test('missing covers and external resources stay image-free',async()=>{
  assert.equal(await epubPreviewCover(await book('none')),null);
  const zip=await JSZip.loadAsync(await book());
  zip.file('OPS/book.opf','<package><manifest><item properties="cover-image" href="https://example.com/cover.png" media-type="image/png"/></manifest></package>');
  assert.equal(await epubPreviewCover(await zip.generateAsync({type:'nodebuffer'})),null);
  zip.file('OPS/book.opf','<!DOCTYPE package [<!ENTITY external SYSTEM "file:///etc/passwd">]><package/>');
  assert.equal(await epubPreviewCover(await zip.generateAsync({type:'nodebuffer'})),null);
});
test('replaces generic metadata, escapes titles and preserves application',()=>{
  const html=readerPreviewHtml(template,{token,project:{title:'<img onerror="bad">'},cover:{type:'image/png'}});
  assert.ok(html.includes('&lt;img onerror=&quot;bad&quot;&gt;'));
  assert.ok(html.includes('&amp;cover=1'));assert.ok(html.includes('/assets/app.js'));
  assert.ok(!html.includes('hero.png'));assert.ok(!html.includes('application/ld+json'));
  assert.ok(!html.includes(' | DuskTranslate'));assert.ok(!html.includes('og:description'));assert.ok(!html.includes('Read this shared novel'));
  assert.ok(!readerPreviewHtml(template,{token,project:{title:'Book'},cover:null}).includes('og:image'));
});
async function request(handler,query,method='GET'){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},end(body){this.body=body;return this;}};
  await handler({query,method},res);return res;
}
test('serves cover and HEAD, rechecking access every time',async()=>{
  let calls=0,active=true;
  const handler=createReaderHandler({resolve:async()=>{calls++;return active?{title:'Book'}:null;},cover:async()=>({type:'image/png',bytes:png}),template:async()=>template});
  assert.deepEqual((await request(handler,{share:token,cover:'1'})).body,png);
  assert.equal((await request(handler,{share:token,cover:'1'},'HEAD')).body,undefined);
  active=false;assert.equal((await request(handler,{share:token,cover:'1'})).code,404);
  assert.equal(calls,3);
  assert.equal((await request(handler,{share:'invalid',cover:'1'})).code,404);assert.equal(calls,3);
  assert.equal((await request(handler,{},'POST')).code,405);
});
test('cover failures do not block reading; access errors fail closed',async()=>{
  const handler=createReaderHandler({resolve:async()=>({title:'Book'}),cover:async()=>{throw Error('broken');},template:async()=>template});
  const page=await request(handler,{share:token});assert.equal(page.code,200);assert.ok(!page.body.includes('og:image'));
  const denied=createReaderHandler({resolve:async()=>{throw Error('unavailable');},template:async()=>template});
  assert.equal((await request(denied,{share:token,cover:'1'})).code,503);
});
