import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://dusk-translate.vercel.app/');
  await page.locator('#new-project').click();await page.locator('#new-title').fill('Deployment smoke test');
  await page.locator('#new-file').setInputFiles({name:'smoke.txt',mimeType:'text/plain',buffer:Buffer.from('日本語のテストです。')});
  await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');await editor.locator('#src-txt').getByText('日本語のテストです。').waitFor();
  await editor.locator('#tl-out').fill('A hosted deployment check.');
  await page.waitForFunction(()=>document.getElementById('save-status').textContent==='Saved on this device');
  await page.reload();await page.getByRole('button',{name:'Open project',exact:true}).click();
  await editor.locator('#tl-out').getByText('A hosted deployment check.').waitFor();
  assert.deepEqual(errors,[]);
  console.log('Production smoke passed: public page, editor, autosave, reload, resume; no JavaScript errors.');
}finally{await browser.close();}
