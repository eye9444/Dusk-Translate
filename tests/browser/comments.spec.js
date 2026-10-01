import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
test(`selected-text comments persist, navigate, reply and resolve safely at ${width}px`, async ({page}) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => sessionStorage.setItem('dusk-guest','true'));
  await page.goto('/'); await page.locator('#new-project').click();
  await page.locator('#new-title').fill('Review test');
  await page.locator('#new-file').setInputFiles({ name:'source.txt', mimeType:'text/plain', buffer:Buffer.from('Hello world, a source paragraph.') });
  await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');
  await expect(editor.locator('#src-txt')).toContainText('Hello world');
  await editor.locator('#src-txt').evaluate(root => {
    const range=document.createRange(); range.setStart(root.firstChild,6);range.setEnd(root.firstChild,11);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  });
  await editor.locator('#host-tools').click(); await editor.locator('#host-comments').click();
  await expect(page.locator('.comments-panel blockquote')).toHaveText('world');
  const bounds = await page.locator('.comments-panel').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  await page.getByRole('textbox',{name:'New comment',exact:true}).fill('<img src=x onerror=alert(1)> Check this word');
  await page.getByRole('button',{name:'Post comment',exact:true}).click();
  await expect(page.locator('.comment-message')).toHaveCount(1);
  await expect(page.locator('.comment-message img')).toHaveCount(0);
  await page.getByRole('textbox',{name:'Reply to thread'}).fill('Agreed');
  await page.getByRole('button',{name:'Post reply'}).click();
  await expect(page.locator('.comment-message')).toHaveCount(2);
  await page.locator('.comment-quote').click();
  await expect.poll(() => editor.locator('#src-txt').evaluate(() => CSS.highlights.has('dusk-comment'))).toBe(true);
  await page.getByRole('button',{name:'Resolve thread'}).click();
  await expect(page.locator('.comment-thread')).toHaveCount(0);
  await page.getByLabel('Show resolved').check();
  await page.getByRole('button',{name:'Reopen thread'}).click();
  await expect(page.getByRole('button',{name:'Resolve thread'})).toBeVisible();
  await page.getByRole('button',{name:'Close comments'}).click();
  await expect.poll(() => editor.locator('#src-txt').evaluate(() => CSS.highlights.has('dusk-comment'))).toBe(false);
  await page.reload(); await page.getByRole('button',{name:'Open project',exact:true}).click();
  await editor.locator('#host-tools').click(); await editor.locator('#host-comments').click();
  await expect(page.locator('.comment-message')).toHaveCount(2);
  await page.getByRole('button',{name:'Edit comment',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Edit comment text'}).fill('Corrected note');
  await page.getByRole('button',{name:'Save comment',exact:true}).click();
  await expect(page.locator('.comment-message').first()).toContainText('Corrected note');
  await page.getByRole('button',{name:'Delete thread'}).click();
  await expect(page.locator('.comment-thread')).toHaveCount(0);
});
}
