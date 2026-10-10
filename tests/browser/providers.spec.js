import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
async function openEditor(page){
  await page.addInitScript(()=>{sessionStorage.setItem('dusk-guest','true');sessionStorage.setItem('dusk-guest-spending-notice','accepted');});
  await page.goto('/');await page.getByRole('button',{name:'+ New project'}).click();
  await page.locator('#new-title').fill('Very long Japanese project title '.repeat(20));
  await page.locator('#new-file').setInputFiles({name:'book.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({chapters:[{id:'one',text:'こんにちは。'}]}))});
  await page.getByRole('button',{name:'Create project',exact:true}).click();
  const editor=page.frameLocator('#editor');await expect(editor.locator('#src-txt')).not.toBeEmpty();return editor;
}
test('OpenAI and Claude catalogs select their own models and stream translations',async({page})=>{
  const editor=await openEditor(page);
  for(const [provider,key,host,model] of [['openai','sk-test_12345678901234567890','api.openai.com','gpt-example'],['claude','sk-ant-test_12345678901234567890','api.anthropic.com','claude-example']]){
    await page.route(`https://${host}/v1/**`,route=>{
      if(route.request().method()==='GET')return route.fulfill({json:{data:[{id:model}]}});
      const body=route.request().postDataJSON();expect(body.model).toBe(model);
      const events=provider==='claude'?[{type:'content_block_delta',delta:{type:'text_delta',text:'Hello there.'}},{type:'message_delta',delta:{stop_reason:'end_turn'}},{type:'message_stop'}]:[{choices:[{delta:{content:'Hello there.'},finish_reason:'stop'}]}];
      return route.fulfill({contentType:'text/event-stream',body:events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});
    });
    await editor.locator('#api-key').fill(key);await editor.locator('#model-import').click();
    await editor.locator('#provider-select').selectOption(provider);await editor.locator('#import-all-models').click();
    await expect(editor.locator('#model-select')).toHaveValue(`${provider}|${model}`);
    await editor.locator('#model-import-dialog').getByRole('button',{name:'Close',exact:true}).click();
    await editor.locator('#btn-tl').click();await expect(editor.locator('#tl-out')).toHaveText('Hello there.');await expect(editor.locator('#btn-tl')).toBeEnabled();
  }
});
test('custom provider manual model, URL validation and mobile title bounds',async({page})=>{
  await page.setViewportSize({width:390,height:844});const editor=await openEditor(page);
  await editor.locator('.provider-disclosure > summary').click();
  await editor.locator('#model-import').click();await editor.locator('#provider-select').selectOption('custom');
  await editor.locator('#provider-base-url').fill('http://example.com/v1');await editor.locator('#manual-model').fill('test-model');
  await editor.locator('#model-import-dialog').getByRole('button',{name:'Close',exact:true}).click();await editor.locator('#api-key').fill('custom-test-key');await editor.locator('#model-import').click();
  await editor.getByRole('button',{name:'Use model ID'}).click();await expect(editor.locator('#model-import-status')).toContainText('HTTPS');
  await editor.locator('#provider-base-url').fill('https://tokify.sale/v1/');page.once('dialog',d=>d.accept());
  await editor.getByRole('button',{name:'Use model ID'}).click();await expect(editor.locator('#model-select')).toHaveValue('custom|test-model');
  await editor.locator('#model-import-dialog').getByRole('button',{name:'Close',exact:true}).click();
  const bounds=await editor.locator('#host-project-title').evaluate(el=>({title:el.getBoundingClientRect().right,parent:el.closest('.host-identity').getBoundingClientRect().right,overflow:getComputedStyle(el).textOverflow}));
  expect(bounds.title).toBeLessThanOrEqual(bounds.parent);expect(bounds.overflow).toBe('ellipsis');
});
test('mobile reader truncates long chapter tabs and keeps their full labels',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const title='非常に長い章のタイトル'.repeat(15),zip=new JSZip();
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
  zip.file('book.opf','<package><manifest><item id="one" href="one.xhtml"/></manifest><spine><itemref idref="one"/></spine></package>');
  zip.file('one.xhtml',`<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>${title}</h1><p>Test chapter.</p></body></html>`);
  await page.goto('/');await page.locator('#reader-file').setInputFiles({name:'long-title.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  const tab=page.locator('#reader-chapters button').first();await expect(tab).toHaveAttribute('title',title);
  expect(await tab.evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(220);
  expect(await tab.evaluate(el=>getComputedStyle(el).textOverflow)).toBe('ellipsis');
  await tab.click();await expect(page.locator('#reader-content')).toContainText('Test chapter.');
});
