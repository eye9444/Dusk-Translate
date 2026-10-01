import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

test('reader preserves original ruby without injecting book HTML or readings into headings', async ({page}) => {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
  zip.file('book.opf', '<package><manifest><item id="one" href="one.xhtml"/></manifest><spine><itemref idref="one"/></spine></package>');
  zip.file('one.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1><ruby>Tokyo<rt>capital</rt></ruby></h1><p>Visit   <ruby onclick="alert(1)">Tokyo<rp>(</rp><rt>&lt;img src=x onerror=alert(1)&gt;</rt><rp>)</rp></ruby> today. <ruby>Ja<rt>Ni</rt>pan<rt>hon</rt></ruby></p></body></html>');
  await page.addInitScript(() => sessionStorage.setItem('dusk-guest', 'true'));
  await page.goto('/');
  await page.locator('#reader-file').setInputFiles({ name:'ruby.epub', mimeType:'application/epub+zip', buffer:await zip.generateAsync({type:'nodebuffer'}) });
  await expect(page.locator('#reader-chapter-title')).toHaveText('Tokyo');
  await expect(page.locator('#reader-content ruby')).toHaveCount(4);
  await expect(page.locator('#reader-content rt').nth(2)).toHaveText('Ni');
  await expect(page.locator('#reader-content rt').nth(3)).toHaveText('hon');
  await expect(page.locator('#reader-content rt').nth(1)).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#reader-content img, #reader-content [onclick], #reader-content rp')).toHaveCount(0);
  expect(await page.locator('#reader-content p').last().evaluate(p => {
    const copy = p.cloneNode(true); copy.querySelectorAll('rt').forEach(rt => rt.remove()); return copy.textContent;
  })).toBe('Visit Tokyo today. Japan');
});
