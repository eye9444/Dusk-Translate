import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
test.beforeEach(async({context})=>{await context.addInitScript(()=>sessionStorage.setItem('dusk-guest','true'));});
const fixture = { chapters:[{id:'p-001',text:'テストの文章です。Chapter one.',jp_char_count:9},{id:'p-002',text:'次の章の文章です。Chapter two.',jp_char_count:9}] };
async function create(page,name='Test book',file) {
  await page.goto('/');
  await page.getByRole('button',{name:'+ New project'}).click();
  await page.locator('#new-title').fill(name);
  await page.locator('#new-file').setInputFiles(file || {name:'book.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.getByRole('button',{name:'Create project',exact:true}).click();
  await expect(page.frameLocator('#editor').locator('#src-txt')).not.toBeEmpty();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
}
async function editorAction(page,id) {const editor=page.frameLocator('#editor');await editor.locator('#host-menu').click();await editor.locator(id).click();}
async function leave(page) {await editorAction(page,'#host-library');await expect(page.locator('#library')).toBeVisible();}
test('saves manual edits, glossary, current chapter; keys never persist',async({page})=>{
  await create(page);
  const editor=page.frameLocator('#editor');
  await editor.locator('#tl-out').fill('My edited translation');
  await editor.getByRole('button',{name:'Glossary',exact:true}).click();
  await editor.locator('#glossary').fill('名前 = Name');
  await editor.locator('#api-key').fill('AIzaTEST_SECRET_DO_NOT_STORE_12345');
  await editor.locator('#btn-next').click();
  await expect(editor.locator('#src-txt')).toContainText('Chapter two');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  const saved=await page.evaluate(async()=>{const request=indexedDB.open('dusktranslate-library');const db=await new Promise(resolve=>request.onsuccess=()=>resolve(request.result));const req=db.transaction('projects').objectStore('projects').getAll();return new Promise(resolve=>req.onsuccess=()=>resolve(JSON.stringify(req.result)));});
  expect(saved).not.toContain('TEST_SECRET');expect(saved).toContain('My edited translation');
  await page.reload();await page.getByRole('button',{name:'Open project',exact:true}).click();
  await expect(editor.locator('#src-txt')).toContainText('Chapter two');
  await expect(editor.locator('#api-key')).toHaveValue('');
  await editor.locator('#btn-prev').click();await expect(editor.locator('#tl-out')).toHaveText('My edited translation');
  await editor.getByRole('button',{name:'Glossary',exact:true}).click();await expect(editor.locator('#glossary')).toHaveValue('名前 = Name');
});
test('rename, archive, restore, delete keep projects isolated',async({page})=>{
  await create(page,'First');await leave(page);await create(page,'Second');await leave(page);
  const first=page.locator('.project-card').filter({has:page.getByRole('heading',{name:'First',exact:true})});
  await first.getByRole('button',{name:'Rename'}).click();await page.locator('#rename-title').fill('Renamed');await page.locator('#manage-submit').click();
  const renamed=page.locator('.project-card').filter({has:page.getByRole('heading',{name:'Renamed'})});
  await renamed.getByRole('button',{name:'Archive',exact:true}).click();await page.locator('#manage-submit').click();
  await expect(page.locator('.project-card')).toHaveCount(1);await page.locator('#filter').selectOption('archived');
  await page.getByRole('button',{name:'Restore',exact:true}).click();await page.locator('#manage-submit').click();
  await page.locator('#filter').selectOption('active');await expect(page.locator('.project-card')).toHaveCount(2);
  await renamed.getByRole('button',{name:'Delete',exact:true}).click();await page.locator('#manage-submit').click();
  await expect(page.locator('.project-card')).toHaveCount(1);await expect(page.getByRole('heading',{name:'Second',exact:true,level:3})).toBeVisible();
});
test('untrusted titles render as text',async({page})=>{
  const malicious={chapters:[{id:'<img src=x onerror=alert(1)>',text:'<svg onload=alert(2)> book text'}]};
  let dialogs=0;page.on('dialog',async d=>{dialogs++;await d.dismiss();});
  await create(page,'<script>alert(3)</script>',{name:'unsafe.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malicious))});
  await expect(page.frameLocator('#editor').locator('#ch-list img')).toHaveCount(0);expect(dialogs).toBe(0);
});
test('original EPUB survives reload and can export translated chapters',async({page})=>{
  const zip=new JSZip();zip.file('mimetype','application/epub+zip');
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>');
  zip.file('OEBPS/book.opf','<package><manifest><item href="one.xhtml" media-type="application/xhtml+xml" id="one"/></manifest><spine><itemref idref="one"/></spine></package>');
  zip.file('OEBPS/one.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Demo</title></head><body><p>日本語のテストです。</p></body></html>');
  await create(page,'EPUB test',{name:'book.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  const editor=page.frameLocator('#editor');await editor.locator('#tl-out').fill('An original test translation.');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');await page.reload();await page.getByRole('button',{name:'Open project',exact:true}).click();
  await expect(editor.locator('#btn-epub-export')).toBeEnabled();const pending=page.waitForEvent('download');await editor.locator('#btn-epub-export').click();const download=await pending;
  const {readFile}=await import('node:fs/promises');const output=await JSZip.loadAsync(await readFile(await download.path()));
  expect(await output.file('OEBPS/one.xhtml').async('string')).toContain('An original test translation.');
  await leave(page);const card=page.locator('.project-card').filter({has:page.getByRole('heading',{name:'EPUB test',exact:true})});
  await expect(card.getByRole('button',{name:'Read translation'})).toBeEnabled();await card.getByRole('button',{name:'Read translation'}).click();
  await expect(page.locator('#reader-edition')).toHaveText('TRANSLATED EDITION');await expect(page.locator('#reader-content')).toContainText('An original test translation.');await page.locator('#reader-back').click();
});
test('built-in EPUB reader opens chapters and supports accessible font controls',async({page})=>{
  const zip=new JSZip();zip.file('mimetype','application/epub+zip');
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>');
  zip.file('OEBPS/book.opf','<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Built-in reader test</dc:title></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>');
  zip.file('OEBPS/one.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>First chapter</h1><p>Japanese reader text.</p></body></html>');
  zip.file('OEBPS/two.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Second chapter</h1><p>Another paragraph.</p></body></html>');
  const epubBuffer=await zip.generateAsync({type:'nodebuffer'});
  await create(page,'Reader test',{name:'reader.epub',mimeType:'application/epub+zip',buffer:epubBuffer});
  await leave(page);await page.locator('#reader-file').setInputFiles({name:'standalone.epub',mimeType:'application/epub+zip',buffer:epubBuffer});
  await expect(page.locator('#reader-edition')).toHaveText('STANDALONE EPUB');await page.locator('#reader-back').click();
  await page.getByRole('button',{name:'Read original',exact:true}).click();
  await expect(page.locator('#reader')).toBeVisible();await expect(page.locator('#reader-title')).toHaveText('Built-in reader test');
  await expect(page.locator('#reader-content')).toContainText('Japanese reader text.');await expect(page.locator('#reader-chapters button')).toHaveCount(2);
  const initial=await page.locator('#reader-page').evaluate(el=>getComputedStyle(el).getPropertyValue('--reader-font-size'));
  await page.locator('#reader-font-up').click();expect(await page.locator('#reader-page').evaluate(el=>getComputedStyle(el).getPropertyValue('--reader-font-size'))).not.toBe(initial);
  await page.locator('#reader-chapters button').nth(1).click();await expect(page.locator('#reader-content')).toContainText('Another paragraph.');
  await page.locator('#reader-page').focus();await page.keyboard.press('0');await expect(page.locator('#reader-font-value')).toHaveText('20 px');
  await page.locator('#reader-back').click();await expect(page.locator('#library')).toBeVisible();
});
test('same project cannot be edited in two tabs',async({page,context})=>{
  await create(page);const second=await context.newPage();await second.goto('/');await second.getByRole('button',{name:'Open project',exact:true}).click();
  await expect(second.locator('#library-status')).toContainText('already open in another tab');await second.close();
});
test('mobile library fits the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await create(page,'Mobile book');await leave(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('mobile editor collapses controls and gives source and translation equal scroll areas',async({page})=>{
  await page.setViewportSize({width:390,height:844});await create(page,'Mobile editor');const editor=page.frameLocator('#editor');
  await expect(editor.locator('.provider-disclosure')).not.toHaveAttribute('open','');await expect(editor.locator('.tool-disclosure')).not.toHaveAttribute('open','');await expect(editor.locator('.chapter-disclosure')).not.toHaveAttribute('open','');
  const source=await editor.locator('.pane-left').boundingBox(),translation=await editor.locator('.pane:not(.pane-left)').boundingBox();
  expect(translation.y).toBeGreaterThan(source.y);expect(Math.abs(source.height-translation.height)).toBeLessThanOrEqual(2);
  await expect(editor.locator('#src-txt')).toHaveCSS('overflow-y','auto');await expect(editor.locator('#tl-out')).toHaveCSS('overflow-y','auto');
  await editor.locator('#tl-out').focus();await expect(editor.locator('#tl-out')).toHaveCSS('outline-width','1px');
  await editor.locator('.provider-disclosure summary').click();await expect(editor.locator('.api-key-guide')).toBeVisible();await expect(editor.locator('.api-key-guide')).toHaveAttribute('target','_blank');
  await editor.locator('.tool-disclosure summary').click();await expect(editor.locator('#btn-tl')).toBeVisible();await expect(editor.locator('.provider-disclosure')).not.toHaveAttribute('open','');
  await page.screenshot({path:'/tmp/dusktranslate-mobile-editor.png',fullPage:true,animations:'disabled'});
});
test('login honestly reports missing configuration',async({page})=>{
  await page.goto('/');await page.locator('#account').click();await expect(page.locator('#auth-info')).toContainText('not configured');await expect(page.locator('#auth-submit')).toBeDisabled();await expect(page.locator('#google-auth')).toBeDisabled();
});
test('backup ZIP restores a project with its edited translation',async({page})=>{
  await create(page,'Backup source');const editor=page.frameLocator('#editor');await editor.locator('#tl-out').fill('Keep this translation.');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  const pending=page.waitForEvent('download');await editorAction(page,'#host-backup');const file=await pending;
  const {readFile}=await import('node:fs/promises');const buffer=await readFile(await file.path());
  await leave(page);await create(page,'Restored',{name:'backup.zip',mimeType:'application/zip',buffer});
  await expect(editor.locator('#tl-out')).toHaveText('Keep this translation.');
});
test('stream interruptions preserve short partial output and lock navigation',async({page})=>{
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    await new Promise(resolve=>setTimeout(resolve,700));
    await route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Short partial output'}]}}]})+'\n\n'});
  });
  await create(page);const editor=page.frameLocator('#editor');await editor.locator('#api-key').fill('AIzaFAKE_TEST_KEY_123456789012345');
  await editor.locator('#btn-tl').click();await editor.locator('#host-menu').click();await expect(editor.locator('#host-library')).toBeDisabled();await editor.locator('#host-menu').click();await editor.locator('#btn-next').click();
  await expect(editor.locator('#src-txt')).toContainText('Chapter one');
  await expect(editor.locator('.partial-badge')).toBeVisible();await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();await page.getByRole('button',{name:'Open project',exact:true}).click();
  await expect(editor.locator('#tl-out')).toContainText('Short partial output');await expect(editor.locator('.partial-badge')).toBeVisible();
});
test('capture library and editor layouts',async({page})=>{
  await page.goto('/');await page.screenshot({path:'/tmp/dusktranslate-empty.png',fullPage:true,animations:'disabled'});
  await create(page,'A small book of everyday Japanese');await page.frameLocator('#editor').locator('#tl-out').fill('Every day begins with a new sentence.');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.screenshot({path:'/tmp/dusktranslate-workspace.png',fullPage:true,animations:'disabled'});
  await leave(page);await page.screenshot({path:'/tmp/dusktranslate-library.png',fullPage:true,animations:'disabled'});
  await page.locator('#theme').click();await page.screenshot({path:'/tmp/dusktranslate-eclipse.png',fullPage:true,animations:'disabled'});await page.locator('#theme').click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/dusktranslate-mobile.png',fullPage:true,animations:'disabled'});
});

test('collection navigation, search shortcut and layout preferences work',async({page})=>{
  await create(page,'A quiet afternoon');await leave(page);
  await expect(page.locator('#active-count')).toHaveText('1');
  await page.keyboard.press('/');await expect(page.locator('#search')).toBeFocused();
  await page.locator('#search').fill('no such book');await expect(page.locator('.empty')).toContainText('No projects match that title');
  await expect(page.locator('#resume-strip')).toBeHidden();await page.getByRole('button',{name:'Clear search'}).click();
  await page.locator('#view-list').click();await page.reload();await expect(page.locator('#view-list')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#projects')).toHaveClass(/list-view/);
  await page.locator('#nav-archived').click();await expect(page.locator('#collection-title')).toHaveText('Archived projects');
  await expect(page.locator('#nav-archived')).toHaveAttribute('aria-current','page');
  await page.getByRole('button',{name:'Back to my library'}).click();await expect(page.locator('.project-card')).toHaveCount(1);
  await page.locator('#resume-project').click();await expect(page.frameLocator('#editor').locator('#src-txt')).not.toBeEmpty();
});

test('empty import action works and decorative books have no shadow',async({page})=>{
  await page.goto('/');await expect(page.locator('.book').first()).toHaveCSS('box-shadow','none');
  await page.getByRole('button',{name:'Start translating'}).click();await expect(page.locator('#project-dialog')).toBeVisible();
});

test('desktop, tablet and small-phone controls remain within the window',async({page})=>{
  for(const width of [320,768,1920]){
    await page.setViewportSize({width,height:1000});await page.goto('/');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for(const id of ['account','theme','new-project','search','refresh','nav-archived']){
      const bounds=await page.locator('#'+id).boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
    }
  }
});

test('Eclipse uses dark surfaces and the logo loads',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});await page.goto('/');
  const bounds=await page.locator('.app-window').boundingBox();expect(bounds.width).toBeGreaterThan(1800);
  await expect(page.locator('#brand img')).toHaveJSProperty('naturalWidth',64);
  const favicon=await page.request.get('/brand/dusk-mark.svg');expect(favicon.ok()).toBe(true);
  const ink=await page.locator('#library h1').evaluate(el=>getComputedStyle(el).color);
  const background=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage);
  await page.screenshot({path:'/tmp/dusk-glass-day.png',fullPage:true,animations:'disabled'});
  await page.locator('#theme').click();
  expect(await page.locator('#library h1').evaluate(el=>getComputedStyle(el).color)).not.toBe(ink);
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage)).not.toBe(background);
  await expect(page.locator('.book').first()).toHaveCSS('box-shadow','none');
  await page.screenshot({path:'/tmp/dusk-glass-night.png',fullPage:true,animations:'disabled'});
});
