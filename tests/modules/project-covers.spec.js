import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
test('cover extraction supports EPUB2 and rejects remote, oversized and unsupported resources',async({page})=>{
  await page.goto('/');
  for(const scenario of ['epub2','remote','oversized','svg','missing']){
    const zip=new JSZip();zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
    zip.file('OPS/book.opf',`<package><metadata><meta name="cover" content="art"/></metadata><manifest><item id="art" href="${scenario==='remote'?'https://example.com/cover.png':'cover.png'}" media-type="${scenario==='svg'?'image/svg+xml':'image/png'}"/></manifest></package>`);
    if(scenario!=='missing')zip.file('OPS/cover.png',scenario==='oversized'?'x'.repeat(12*1024*1024+1):'image');
    const result=await page.evaluate(async({source})=>{
      const {readEpubCover}=await import('/src/project-covers.js');
      try{const cover=await readEpubCover(new Blob([Uint8Array.from(atob(source),c=>c.charCodeAt(0))]));return cover?.size||0;}catch{return 'rejected';}
    },{source:await zip.generateAsync({type:'base64',compression:'DEFLATE'})});
    expect(result).toBe(scenario==='epub2'?5:scenario==='oversized'?'rejected':0);
  }
});
