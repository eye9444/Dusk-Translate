import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
import {readFile} from 'node:fs/promises';

test.beforeEach(async({context})=>{
  await context.addInitScript(()=>{sessionStorage.setItem('dusk-guest','true');sessionStorage.setItem('dusk-guest-spending-notice','accepted');});
});
async function leave(page){const editor=page.frameLocator('#editor');await editor.locator('#host-menu').click();await editor.locator('#host-library').click();await expect(page.locator('#library')).toBeVisible();}
for(const [source,target,text] of [
  ['ja','ko','小説の第一章です。'],['en','ko','The first chapter.'],['ko','en','이야기가 시작됩니다.'],
  ['ja','zh-Hans','小説の第一章です。'],['en','zh-Hans','The first chapter.'],['zh-Hans','en','故事从这里开始。'],
])test(`${source} to ${target} persists through reopen and exported EPUB metadata`,async({page})=>{
  await page.goto('/');await page.locator('#new-project').click();await page.locator('#new-title').fill('Language route');
  await page.locator('#new-file').setInputFiles({name:'chapter.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.locator('#new-source-language').selectOption(source);await page.locator('#new-target-language').selectOption(target);await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');await expect(editor.locator('#src-txt')).toHaveAttribute('lang',source);await expect(editor.locator('#tl-out')).toHaveAttribute('lang',target);
  await editor.locator('#tl-out').fill('A completed test translation.');await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await leave(page);await page.reload();await page.locator('.project-card').first().click();
  await expect(editor.locator('#src-txt')).toHaveAttribute('lang',source);await expect(editor.locator('#tl-out')).toHaveAttribute('lang',target);await expect(editor.locator('#tl-out')).toHaveText('A completed test translation.');
  const pending=page.waitForEvent('download');await editor.locator('#btn-epub-export').click();const download=await pending;
  const zip=await JSZip.loadAsync(await readFile(await download.path())),opf=Object.values(zip.files).find(file=>file.name.endsWith('.opf'));
  expect(await opf.async('string')).toContain(`<dc:language>${target}</dc:language>`);
});
test('guest language preference persists and empty web novels use the chosen pair',async({page})=>{
  await page.goto('/');await page.locator('.account-actions').evaluate(node=>node.closest('dialog').showModal());
  await page.getByRole('button',{name:'Editor preferences',exact:true}).click();
  const dialog=page.locator('#editor-preferences-dialog');await dialog.getByLabel('Default translation pair').selectOption('en|ko');await dialog.getByRole('button',{name:'Save preferences'}).click();
  await page.locator('.account-actions').evaluate(node=>node.closest('dialog').close());await page.reload();await page.locator('#new-project').click();
  await expect(page.locator('#new-source-language')).toHaveValue('en');await expect(page.locator('#new-target-language')).toHaveValue('ko');
  await page.getByLabel('Start an empty Web Novel').check();await page.locator('#new-title').fill('Preferred empty book');await page.locator('#create-submit').click();
  await expect(page.frameLocator('#editor').locator('#tl-out')).toHaveAttribute('lang','ko');
});
test('chapter progress reflects saved translation and clicking it stays in the library',async({page})=>{
  await page.goto('/');await page.locator('#new-project').click();await page.locator('#new-title').fill('Progress');
  await page.locator('#new-file').setInputFiles({name:'book.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({chapters:[{id:'one',text:'One'},{id:'two',text:'Two'}]}))});await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');await editor.locator('#tl-out').fill('First chapter translated.');await expect(page.locator('#save-status')).toHaveText('Saved on this device');await leave(page);
  await page.locator('#view-grid').click();const bar=page.getByRole('progressbar');await expect(bar).toHaveAttribute('aria-label','50% translated');expect(await bar.evaluate(node=>node.value)).toBe(50);
  await bar.click();await expect(page.locator('#library')).toBeVisible();await expect(page.locator('#editor')).toBeHidden();
});
test('hero community links use accessible icons and do not appear twice in the hero',async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL});const page=await context.newPage();
  try{
  await page.goto('/');
  const social=page.getByRole('navigation',{name:'Community links'});await expect(social.locator('a')).toHaveCount(3);
  await expect(social.getByRole('link',{name:'Reddit: u/eye9444'})).toHaveAttribute('href','https://www.reddit.com/user/eye9444/');
  await expect(social.getByRole('link',{name:'Join the Discord server'})).toHaveAttribute('href','https://discord.gg/48btenHty2');
  await expect(social.getByRole('link',{name:'DuskTranslate on GitHub'})).toHaveAttribute('href','https://github.com/eye9444/Dusk-Translate');
  }finally{await context.close();}
});
