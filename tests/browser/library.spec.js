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
async function selectTestModel(editor) {
  await editor.locator('#model-select').evaluate(select=>{
    const option=document.createElement('option');
    option.value='ai|test-model';
    option.textContent='Test model';
    select.replaceChildren(option);
    select.disabled=false;
    select.value=option.value;
    onKeyInput();
  });
}
async function editorAction(page,id) {const editor=page.frameLocator('#editor');await editor.locator(id === '#host-library' ? '#host-menu' : '#host-tools').click();await editor.locator(id).click();}
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
  await editor.locator('#tl-out').focus();await expect(editor.locator('#tl-out')).toHaveCSS('outline-style','none');await expect(editor.locator('.pane:not(.pane-left)')).not.toHaveCSS('box-shadow','none');
  await editor.locator('#host-tools').click();await expect(editor.locator('#host-dictionary')).toBeVisible();await expect(editor.locator('#host-find-replace')).toBeVisible();await expect(editor.locator('#host-consistency')).toBeVisible();await editor.locator('#host-dictionary').click();await expect(page.locator('#dictionary-dialog')).toBeVisible();await page.getByRole('button',{name:'Close Japanese lookup'}).click();
  await editor.locator('.provider-disclosure summary').click();await expect(editor.locator('.api-key-guide')).toBeVisible();await expect(editor.locator('.api-key-guide')).toHaveAttribute('target','_blank');
  const provider=await editor.locator('.provider-disclosure .mobile-disclosure-content').boundingBox(),keyField=await editor.locator('.provider-key-field').boundingBox(),modelField=await editor.locator('.provider-model-field').boundingBox();
  expect(modelField.y).toBeGreaterThan(keyField.y+keyField.height);expect(keyField.width).toBeLessThanOrEqual(provider.width);expect(modelField.width).toBeLessThanOrEqual(provider.width);
  await editor.locator('.provider-disclosure summary').click();
  const providerSummary=await editor.locator('.provider-disclosure summary').boundingBox(),chapterSummary=await editor.locator('.chapter-disclosure summary').boundingBox(),toolSummary=await editor.locator('.tool-disclosure summary').boundingBox(),keyBar=await editor.locator('.key-bar').boundingBox();
  expect(providerSummary.x).toBe(chapterSummary.x);expect(providerSummary.width).toBe(chapterSummary.width);expect(providerSummary.width).toBe(toolSummary.width);expect(Math.abs(providerSummary.y-(keyBar.y+keyBar.height))).toBeLessThanOrEqual(1);
  await editor.locator('.tool-disclosure summary').click();await expect(editor.locator('#btn-tl')).toBeVisible();await expect(editor.locator('.provider-disclosure')).not.toHaveAttribute('open','');
  await page.screenshot({path:'/tmp/dusktranslate-mobile-editor.png',fullPage:true,animations:'disabled'});
});
test('desktop AI provider bar keeps key, model and help aligned',async({page})=>{
  await page.setViewportSize({width:1600,height:900});await create(page,'Provider layout');const editor=page.frameLocator('#editor');
  const bar=await editor.locator('.key-bar').boundingBox(),keyControl=await editor.locator('.key-input-wrap').boundingBox(),modelControl=await editor.locator('.model-picker').boundingBox();
  expect(Math.abs(keyControl.y-modelControl.y)).toBeLessThanOrEqual(2);expect(keyControl.x+keyControl.width).toBeLessThanOrEqual(modelControl.x);expect(Math.abs(keyControl.width-modelControl.width)).toBeLessThanOrEqual(1);expect(modelControl.width).toBeLessThanOrEqual(310);expect(bar.height).toBeLessThanOrEqual(70);
  expect(await editor.locator('.key-bar').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  expect(await editor.locator('.key-bar').evaluate(element=>getComputedStyle(element,'::after').content)).toBe('none');
  await editor.locator('#api-key').focus();await expect(editor.locator('#api-key')).toHaveCSS('outline-width','1px');
});
test('AI Studio key formats enable the live model importer',async({page})=>{
  await create(page,'AI Studio key formats');const editor=page.frameLocator('#editor');
  for(const key of ['AIzaFAKE_TEST_KEY_123456789012345','AQ.TEST_AUTHORIZATION_KEY_123456789']){
    await editor.locator('#api-key').fill(key);await expect(editor.locator('#key-status')).toContainText('Import models');await expect(editor.locator('#model-import')).toBeEnabled();await expect(editor.locator('#btn-tl')).toBeDisabled();
  }
});
test('chapter chunking keeps requests at 5000 characters and preserves source text',async({page})=>{
  await create(page,'Chunk boundaries');const editor=page.frameLocator('#editor');
  const result=await editor.locator('#src-txt').evaluate(()=>{
    const justOver='あ'.repeat(5001), tenThousand='い'.repeat(10000), short='う'.repeat(5000);
    const inspect=text=>{const chunks=splitTranslationChunks(text);return {count:chunks.length,lengths:chunks.map(chunk=>chunk.length),same:chunks.join('')===text};};
    return {justOver:inspect(justOver),tenThousand:inspect(tenThousand),short:inspect(short)};
  });
  expect(result.short).toEqual({count:1,lengths:[5000],same:true});
  expect(result.justOver.count).toBe(2);expect(result.justOver.lengths.every(length=>length<=5000)).toBe(true);expect(result.justOver.same).toBe(true);
  expect(result.tenThousand).toEqual({count:2,lengths:[5000,5000],same:true});
});
test('long chapters are translated sequentially in bounded requests',async({page})=>{
  const requests=[];
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    requests.push(JSON.parse(route.request().postData()).contents[0].parts[0].text);
    const parts=requests.length===1
      ? [{text:'provider-native thought',thought:true},{text:'<think>visible reasoning</think>part 1'}]
      : [{text:'part 2'}];
    const response={candidates:[{content:{parts},finishReason:'STOP'}]};
    await route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify(response)+'\n\n'});
  });
  const longChapter={chapters:[{id:'p-long',text:'あ'.repeat(5001),jp_char_count:5001}]};
  await create(page,'Chunked request',{name:'long.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(longChapter))});
  const editor=page.frameLocator('#editor');await selectTestModel(editor);await editor.locator('#api-key').fill('AQ.TEST_AUTHORIZATION_KEY_123456789');
  await editor.locator('#btn-tl').click();await expect(editor.locator('#tl-out')).toContainText('part 1');await expect(editor.locator('#tl-out')).toContainText('part 2');
  const sources=requests.map(prompt=>prompt.split('Japanese text:\n').at(-1));
  expect(requests).toHaveLength(2);expect(sources.every(source=>source.length<=5000)).toBe(true);
  expect(sources.join('')).toBe(longChapter.chapters[0].text);
  const continuity=requests[1].match(/---\n([\s\S]*?)\n---\n\nJapanese text/)[1];
  expect(continuity).toBe('part 1');expect(await editor.locator('#tl-out').textContent()).toBe('part 1\n\npart 2');
});
test('model importer fetches live provider models and filters OpenRouter free models',async({page})=>{
  await page.route('https://generativelanguage.googleapis.com/v1beta/models',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({models:[
    {name:'models/gemini-live',displayName:'Gemini Live',inputTokenLimit:32000,supportedGenerationMethods:['generateContent']},
    {name:'models/embedding-only',displayName:'Embedding only',supportedGenerationMethods:['embedContent']}
  ]})}));
  await page.route('https://openrouter.ai/api/v1/models',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:[
    {id:'free/text-model:free',name:'Free text model',context_length:16000,pricing:{prompt:'0',completion:'0'},architecture:{output_modalities:['text']}},
    {id:'paid/text-model',name:'Paid text model',context_length:64000,pricing:{prompt:'0.000001',completion:'0.000002'},architecture:{output_modalities:['text']}},
    {id:'free/image-model:free',name:'Free image model',pricing:{prompt:'0',completion:'0'},architecture:{output_modalities:['image']}}
  ]})}));
  await create(page,'Live catalog');const editor=page.frameLocator('#editor');
  await editor.locator('#api-key').fill('AQ.TEST_AUTHORIZATION_KEY_123456789');
  await editor.locator('#model-import').click();await expect(editor.locator('#model-import-dialog')).toBeVisible();await editor.locator('#import-free-models').click();
  await expect(editor.locator('#model-select')).toHaveValue('ai|gemini-live');await expect(editor.locator('#model-select option')).toHaveCount(1);await expect(editor.locator('#btn-tl')).toBeEnabled();
  await editor.getByRole('button',{name:'Close',exact:true}).click();
  await editor.locator('#api-key').fill('sk-or-v1-TEST_AUTHORIZATION_KEY_123456789');
  await editor.locator('#model-import').click();await editor.locator('#import-free-models').click();
  await expect(editor.locator('#model-select')).toHaveValue('or|free/text-model:free');await expect(editor.locator('#model-select option')).toHaveCount(1);
  await editor.locator('#import-all-models').click();await expect(editor.locator('#model-select option')).toHaveCount(2);await expect(editor.locator('#model-select')).toHaveValue('or|free/text-model:free');
  await expect(editor.locator('#model-import-status')).toContainText('Imported 2');
  await editor.locator('#model-select').selectOption('or|paid/text-model');await expect(editor.locator('#btn-tl')).toBeEnabled();
});
test('Japanese source is selectable and includes the Yomitan iframe setup note',async({page})=>{
  await create(page,'Dictionary support');const editor=page.frameLocator('#editor');
  await expect(editor.locator('#src-txt')).toHaveAttribute('lang','ja');await expect(editor.locator('#src-txt')).toHaveAttribute('translate','no');
  await expect(editor.locator('#src-txt')).toHaveCSS('user-select','text');
  await editor.locator('#host-tools').click();await editor.locator('#host-dictionary').click();await expect(page.locator('#dictionary-dialog')).toBeVisible();
  await expect(page.locator('#dictionary-dialog')).toContainText('Show iframe popups in the root frame');
  await expect(page.locator('#dictionary-dialog')).toContainText('hold Shift and hover');
  const popup=await page.locator('#dictionary-dialog').boundingBox();expect(popup.width).toBeLessThanOrEqual(420);expect(popup.x+popup.width).toBeGreaterThan(1200);
  expect(parseFloat(await page.locator('.dictionary-help p').first().evaluate(element=>getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(15);
  await page.getByRole('button',{name:'Close Japanese lookup'}).focus();await expect(page.getByRole('button',{name:'Close Japanese lookup'})).toHaveCSS('outline-style','none');
  await page.mouse.click(20,400);await expect(page.locator('#dictionary-dialog')).not.toBeVisible();
  await editor.locator('#host-tools').click();await editor.locator('#host-dictionary').click();
  await expect(page.getByRole('link',{name:'Open Yomitan setup ↗'})).toHaveAttribute('href','https://yomitan.wiki/getting-started/');
  await expect(page.getByRole('link',{name:'Open Yomitan setup ↗'})).toHaveAttribute('target','_blank');
  await page.getByRole('button',{name:'Close Japanese lookup'}).click();await expect(page.locator('#dictionary-dialog')).not.toBeVisible();
});
test('login honestly reports missing configuration',async({page})=>{
  await page.goto('/');await page.locator('#account').click();await expect(page.locator('#auth-info')).toContainText('not configured');await expect(page.locator('#auth-submit')).toBeDisabled();await expect(page.locator('#google-auth')).toBeDisabled();
});
test('backup ZIP restores a project with its edited translation',async({page})=>{
  await create(page,'Backup source');const editor=page.frameLocator('#editor');await editor.locator('#tl-out').fill('Keep this translation.');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  const pending=page.waitForEvent('download');await editorAction(page,'#host-backup');const file=await pending;
  const {readFile}=await import('node:fs/promises');const buffer=await readFile(await file.path());
  const archive=await JSZip.loadAsync(buffer);const manifest=JSON.parse(await archive.file('project.json').async('string'));
  expect(manifest.schemaVersion).toBe(2);expect(manifest.title).toBe('Backup source');expect(await archive.file('translation.txt').async('string')).toContain('Keep this translation.');
  await leave(page);await page.locator('#import-project').click();await expect(page.locator('#new-title-label')).toBeHidden();await page.locator('#new-file').setInputFiles({name:'backup.zip',mimeType:'application/zip',buffer});await page.locator('#create-submit').click();
  await expect(editor.locator('#tl-out')).toHaveText('Keep this translation.');
});
test('find review navigates without replacing and replacement needs an explicit value',async({page})=>{
  await create(page);const editor=page.frameLocator('#editor');
  async function openFindReplace(){await editorAction(page,'#host-find-replace');}
  await editor.locator('#tl-out').fill('cat dog');await openFindReplace();
  await page.locator('#find-text').fill('cat');await page.locator('#preview-btn').click();
  await expect.poll(()=>editor.locator('#tl-out').evaluate(()=>CSS.highlights.has('dusk-find-current'))).toBe(true);await expect(page.locator('#find-position')).toHaveText('1 of 1');
  await expect(page.locator('#replace-btn')).toBeHidden();await page.locator('.match-item').click();await expect(page.locator('#find-replace-dialog')).not.toBeVisible();
  await expect(editor.locator('#host-find-navigator')).toBeVisible();await expect(editor.locator('#host-find-navigator output')).toHaveText('1 of 1');
  await editor.locator('#host-find-navigator button',{hasText:'Find'}).click();await expect(page.locator('#find-replace-dialog')).toBeVisible();await expect(page.locator('#find-text')).toHaveValue('cat');await page.getByRole('button',{name:'Close',exact:true}).click();await expect(editor.locator('#host-find-navigator')).toBeHidden();
  await openFindReplace();
  await page.locator('#find-text').fill('dog');await expect(page.locator('#replace-btn')).toBeHidden();
  await page.locator('#find-text').fill('cat');await page.locator('#replace-text').fill('$&');await page.locator('#preview-btn').click();await page.locator('#replace-btn').click();
  await expect(editor.locator('#tl-out')).toHaveText('$& dog');
  await editor.locator('#tl-out').fill('cat');await openFindReplace();await page.locator('#find-text').fill('cat');await page.locator('#replace-text').fill('fox');await page.locator('#preview-btn').click();await page.locator('#replace-btn').click();
  await expect(editor.locator('#tl-out')).toHaveText('fox');await editor.locator('#host-tools').click();await editor.locator('#host-undo-find-replace').click();await expect(editor.locator('#tl-out')).toHaveText('cat');
});
test('consistency findings open and highlight the relevant translation passage',async({page})=>{
  const repeated={chapters:[
    {id:'p-001',text:'これは十分に長い繰り返しの文章です。',jp_char_count:17},
    {id:'p-002',text:'これは十分に長い繰り返しの文章です。',jp_char_count:17}
  ]};
  await create(page,'Consistency navigation',{name:'repeated.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(repeated))});
  const editor=page.frameLocator('#editor');await editor.locator('#tl-out').fill('This is the first long translation wording.');await editor.locator('#btn-next').click();await editor.locator('#tl-out').fill('This is a different long translation wording.');
  await editorAction(page,'#host-consistency');await expect(page.locator('#consistency-dialog')).toBeVisible();await page.getByRole('button',{name:'Open chapter 1 match'}).click();
  await expect(page.locator('#consistency-dialog')).not.toBeVisible();await expect(editor.locator('#tl-out')).toContainText('first long translation');await expect.poll(()=>editor.locator('#tl-out').evaluate(()=>CSS.highlights.has('dusk-find-current'))).toBe(true);
  await expect(editor.locator('#host-find-navigator')).toBeVisible();await editor.locator('#host-find-navigator button',{hasText:'Review'}).click();await expect(page.locator('#consistency-dialog')).toBeVisible();
});
test('spellcheck setting and its menu label survive a reload',async({page})=>{
  await create(page);const editor=page.frameLocator('#editor');await editor.locator('#host-tools').click();await editor.locator('#host-spellcheck').click();
  await expect(editor.locator('#host-spellcheck')).toHaveText('Spell check: off');await page.waitForTimeout(1300);await page.reload();await page.getByRole('button',{name:'Open project',exact:true}).click();
  await editor.locator('#tl-out').waitFor();await expect(editor.locator('#tl-out')).toHaveAttribute('spellcheck','false');await editor.locator('#host-tools').click();await expect(editor.locator('#host-spellcheck')).toHaveText('Spell check: off');
});
test('stream interruptions preserve short partial output and lock navigation',async({page})=>{
  let requestKey='';
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    requestKey=route.request().headers()['x-goog-api-key'] || '';
    await new Promise(resolve=>setTimeout(resolve,700));
    await route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Short partial output'}]}}]})+'\n\n'});
  });
  await create(page);const editor=page.frameLocator('#editor');await selectTestModel(editor);await editor.locator('#api-key').fill('AQ.TEST_AUTHORIZATION_KEY_123456789');
  await editor.locator('#btn-tl').click();await editor.locator('#host-menu').click();await expect(editor.locator('#host-library')).toBeDisabled();await editor.locator('#host-menu').click();await editor.locator('#btn-next').click();
  await expect(editor.locator('#src-txt')).toContainText('Chapter one');
  expect(requestKey).toBe('AQ.TEST_AUTHORIZATION_KEY_123456789');
  await expect(editor.locator('.partial-badge')).toBeVisible();await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();await page.getByRole('button',{name:'Open project',exact:true}).click();
  await expect(editor.locator('#tl-out')).toContainText('Short partial output');await expect(editor.locator('.partial-badge')).toBeVisible();
});
test('retry continues a partial translation instead of restarting the chapter',async({page})=>{
  const prompts=[];
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    prompts.push(JSON.parse(route.request().postData()).contents[0].parts[0].text);
    const parts=prompts.length === 1 ? [{text:'First completed part'}] : prompts.length === 2 ? [{text:'Existing partial'}] : [{text:' continuation'}];
    const candidate={content:{parts}};
    if (prompts.length !== 2) candidate.finishReason='STOP';
    if (prompts.length === 3) await new Promise(resolve=>setTimeout(resolve,300));
    await route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[candidate]})+'\n\n'});
  });
  const source='あ'.repeat(5001);
  await create(page,'Resume chunks',{name:'resume.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({chapters:[{id:'p-resume',text:source,jp_char_count:5001}]}))});
  const editor=page.frameLocator('#editor');await selectTestModel(editor);await editor.locator('#api-key').fill('AQ.TEST_AUTHORIZATION_KEY_123456789');
  await editor.locator('#btn-tl').click();await expect(editor.locator('.partial-badge')).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');await page.reload();await page.getByRole('button',{name:'Open project',exact:true}).click();
  await selectTestModel(editor);await editor.locator('#api-key').fill('AQ.TEST_AUTHORIZATION_KEY_123456789');await expect(editor.locator('.partial-badge')).toBeVisible();
  await editor.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(editor.locator('#btn-retry')).toHaveText('Resuming…');await expect(editor.locator('#btn-retry')).toBeDisabled();
  await expect(editor.locator('#tl-out')).toHaveText('First completed part\n\nExisting partial continuation');await expect(editor.locator('.partial-badge')).toHaveCount(0);
  await expect(editor.locator('#btn-retry')).toHaveText('Retry');await expect(editor.locator('#btn-retry')).toBeEnabled();
  const sources=prompts.map(prompt=>prompt.split('Japanese text:\n').at(-1));
  expect(prompts).toHaveLength(3);expect(sources[1]).toBe(sources[2]);expect(sources[2].length).toBeLessThan(source.length);expect(prompts[2]).toContain('Existing partial translation of this same Japanese passage');expect(prompts[2]).toContain('Existing partial');
});
test('legacy partials recover the untranslated source paragraphs',async({page})=>{
  let prompt='';
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    prompt=JSON.parse(route.request().postData()).contents[0].parts[0].text;
    await route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Third translation'}]},finishReason:'STOP'}]})+'\n\n'});
  });
  const source='第一段落。\n\n第二段落。\n\n第三段落。';
  await create(page,'Legacy recovery',{name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({chapters:[{id:'p-legacy',text:source,jp_char_count:15}]}))});
  const editor=page.frameLocator('#editor');await selectTestModel(editor);await editor.locator('#api-key').fill('AQ.TEST_AUTHORIZATION_KEY_123456789');
  await editor.locator('#tl-out').evaluate(()=>{translations['p-legacy']='First translation.\n\nSecond translation.…PARTIAL';partialResumes={};selectCh(0);});
  await editor.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(editor.locator('#tl-out')).toHaveText('First translation.\n\nSecond translation.Third translation');
  expect(prompt).toContain('第三段落。');expect(prompt).not.toContain('第一段落。');expect(prompt).not.toContain('第二段落。');
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
