import {test,expect} from '@playwright/test';
import JSZip from 'jszip';

for(const theme of ['dusk','eclipse'])test(`reader scrollbar remains scrollable in ${theme}`,async({page},testInfo)=>{
  await page.addInitScript(theme=>{localStorage.setItem('theme',theme);sessionStorage.setItem('dusk-guest','true');},theme);
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
  zip.file('book.opf','<package><metadata><title>Scrollbar test</title></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/></spine></package>');
  zip.file('one.xhtml',`<html><body>${'<p>A quiet evening in the reading room. This is a long chapter for testing native scrolling.</p>'.repeat(80)}</body></html>`);
  await page.goto('/');await page.locator('#reader-file').setInputFiles({name:'scroll.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  const reader=page.locator('#reader-page');await expect(page.locator('#reader-content')).toContainText('A quiet evening');
  expect(await reader.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar').width)).toBe('9px');
  await reader.hover();await page.mouse.wheel(0,500);await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({path:testInfo.outputPath(`reader-${theme}.png`)});
  await page.setViewportSize({width:390,height:844});
  await reader.evaluate(el=>el.scrollTop=1000);await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(500);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
