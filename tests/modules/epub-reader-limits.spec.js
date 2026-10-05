import {test,expect} from '@playwright/test';
import JSZip from 'jszip';

async function fixture(bodies, {spine, imageBytes=1024}={}) {
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  const manifest=bodies.map((_,i)=>`<item id="ch${i}" href="ch${i}.xhtml"/>`).join('');
  const refs=(spine || bodies.map((_,i)=>i)).map(i=>`<itemref idref="ch${i}"/>`).join('');
  zip.file('OPS/book.opf',`<package><metadata><title>Limits fixture</title></metadata><manifest>${manifest}</manifest><spine>${refs}</spine></package>`);
  bodies.forEach((body,i)=>zip.file(`OPS/ch${i}.xhtml`,`<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter ${i+1}</h1>${body}</body></html>`));
  zip.file('OPS/image.png',new Uint8Array(imageBytes));
  return zip.generateAsync({type:'base64',compression:'DEFLATE'});
}

async function read(page, encoded) {
  await page.goto('/');
  return page.evaluate(async encoded=>{
    const {readEpub}=await import('/src/epub-reader.js');
    const create=URL.createObjectURL, revoke=URL.revokeObjectURL;
    const created=[],revoked=[];
    URL.createObjectURL=blob=>{const url=create.call(URL,blob);created.push({url,size:blob.size});return url;};
    URL.revokeObjectURL=url=>{revoked.push(url);revoke.call(URL,url);};
    try {
      const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
      try {
        const book=await readEpub(new File([bytes],'fixture.epub'));
        const images=book.chapters.flatMap(ch=>ch.blocks).filter(block=>block.type==='image');
        return {created,revoked,images,chapters:book.chapters.length};
      } catch(error) {return {created,revoked,error:error.message};}
    } finally {
      URL.createObjectURL=create;URL.revokeObjectURL=revoke;
      for(const {url} of created)revoke.call(URL,url);
    }
  },encoded);
}

test('reader shares one image allocation across normalized paths and chapters',async({page})=>{
  const result=await read(page,await fixture([
    '<img src="image.png" alt="first"/><img src="./image.png?x=1" alt="second"/>',
    '<img src="nested/../%69mage.png#fragment" alt="third"/>'.repeat(24),
  ],{imageBytes:1024*1024}));
  expect(result.error).toBeUndefined();
  expect(result.chapters).toBe(2);
  expect(result.images).toHaveLength(26);
  expect(result.created).toHaveLength(1);
  expect(result.created[0].size).toBe(1024*1024);
  expect(new Set(result.images.map(image=>image.src)).size).toBe(1);
  expect(result.images.slice(0,3).map(image=>image.alt)).toEqual(['first','second','third']);
  expect(result.revoked).toEqual([]);
});

test('reader bounds repeated image references and revokes cached images on rejection',async({page})=>{
  const result=await read(page,await fixture(['<img src="image.png"/>'.repeat(4097)]));
  expect(result.error).toContain('image reference limit');
  expect(result.created).toHaveLength(1);
  expect(result.revoked).toEqual(result.created.map(item=>item.url));
});

test('reader revokes prior images when a later chapter has an invalid path',async({page})=>{
  const result=await read(page,await fixture(['<img src="image.png"/>','<img src="%ZZ.png"/>']));
  expect(result.error).toBeTruthy();
  expect(result.created).toHaveLength(1);
  expect(result.revoked).toEqual(result.created.map(item=>item.url));
});

test('reader bounds markup decompression and cleans up earlier chapters',async({page})=>{
  const result=await read(page,await fixture(['<img src="image.png"/>','x'.repeat(8*1024*1024)]));
  expect(result.error).toContain('processing byte limit');
  expect(result.created).toHaveLength(1);
  expect(result.revoked).toEqual(result.created.map(item=>item.url));
});

test('reader rejects excessive repeated spine entries before allocating images',async({page})=>{
  const result=await read(page,await fixture(['<img src="image.png"/>'],{spine:Array(2049).fill(0)}));
  expect(result.error).toContain('spine entry limit');
  expect(result.created).toEqual([]);
});

test('reader bounds nesting and releases images on traversal failure',async({page})=>{
  const result=await read(page,await fixture(['<img src="image.png"/>'+ '<div>'.repeat(130)+'text'+'</div>'.repeat(130)]));
  expect(result.error).toContain('traversal limit');
  expect(result.created).toHaveLength(1);
  expect(result.revoked).toEqual(result.created.map(item=>item.url));
});

test('reader rejects an oversized image before creating its URL',async({page})=>{
  const result=await read(page,await fixture(['<img src="image.png"/>'],{imageBytes:32*1024*1024+1}));
  expect(result.error).toContain('processing byte limit');
  expect(result.created).toEqual([]);
});

test('reader counts repeated spine processing against the cumulative byte budget',async({page})=>{
  const result=await read(page,await fixture(['<img src="image.png"/><!--'+'x'.repeat(4*1024*1024)+'-->'],{spine:Array(33).fill(0)}));
  expect(result.error).toContain('processing byte limit');
  expect(result.created).toHaveLength(1);
  expect(result.revoked).toEqual(result.created.map(item=>item.url));
});
