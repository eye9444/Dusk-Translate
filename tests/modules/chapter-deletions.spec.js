import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
test('deleted EPUB sections prune navigation and only unreferenced images',async({page})=>{
  const zip=new JSZip();
  zip.file('book.opf','<package><metadata><meta name="cover" content="cover"/></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="shared" href="shared.png" media-type="image/png"/><item id="unused" href="unused.png" media-type="image/png"/><item id="cover" href="cover.png" media-type="image/png"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>');
  zip.file('one.xhtml','<html><body><img src="shared.png"/><img src="unused.png"/><img src="cover.png"/></body></html>');
  zip.file('two.xhtml','<html><body><img src="shared.png"/></body></html>');
  zip.file('nav.xhtml','<html><body><nav><ol><li><a href="one.xhtml">One</a></li><li><a href="two.xhtml">Two</a></li></ol></nav></body></html>');
  for(const name of ['shared','unused','cover'])zip.file(name+'.png','image');
  const source=await zip.generateAsync({type:'base64'});await page.goto('/');
  const result=await page.evaluate(async source=>{
    const {buildTranslatedEpub}=await import('/src/epub-reader.js');
    const file=await buildTranslatedEpub(new File([Uint8Array.from(atob(source),c=>c.charCodeAt(0))],'book.epub'),{novel:{_epubOpfPath:'book.opf',chapters:[{id:'two',xhtmlPath:'two.xhtml'}]},translations:{two:'A translation'},deletedChapters:[{id:'one',xhtmlPath:'one.xhtml',removeImages:true}]});
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  },source);
  const output=await JSZip.loadAsync(Uint8Array.from(result)),files=Object.keys(output.files),opf=await output.file('book.opf').async('string'),nav=await output.file('nav.xhtml').async('string');
  expect(files).not.toContain('one.xhtml');expect(files).not.toContain('unused.png');
  expect(files).toContain('shared.png');expect(files).toContain('cover.png');
  expect(opf).not.toContain('idref="one"');expect(nav).not.toContain('one.xhtml');expect(nav).toContain('two.xhtml');
});
