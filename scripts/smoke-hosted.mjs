import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser=await chromium.launch();
try {
  const baseURL=process.env.SMOKE_URL || process.argv[2] || 'https://www.dusktranslate.com';
  const headers=process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{};
  const page=await browser.newPage({extraHTTPHeaders:headers});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(baseURL,{waitUntil:'domcontentloaded'});
  assert.ok(response?.ok(),`Expected ${baseURL} to load successfully, received ${response?.status()}.`);
  if(await page.locator('#welcome').isVisible())await page.locator('#welcome-guest').click();
  await page.locator('#new-project').click();await page.locator('#new-title').fill('Deployment smoke test');
  await page.locator('#new-file').setInputFiles({name:'smoke.txt',mimeType:'text/plain',buffer:Buffer.from('日本語のテストです。')});
  await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');await editor.locator('#src-txt').getByText('日本語のテストです。').waitFor();
  await editor.locator('#tl-out').fill('A hosted deployment check.');
  await page.waitForFunction(()=>document.getElementById('save-status').textContent==='Saved on this device');
  await page.reload();await page.locator('.project-card').first().click();
  await editor.locator('#tl-out').getByText('A hosted deployment check.').waitFor();
  assert.deepEqual(errors,[]);
  console.log(`Hosted smoke passed for ${baseURL}: public page, editor, autosave, reload, resume; no JavaScript errors.`);
}finally{await browser.close();}
