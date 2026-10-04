import {test,expect} from '@playwright/test';

async function editorWithLongText(page) {
  await page.addInitScript(()=>sessionStorage.setItem('dusk-guest','true'));
  await page.goto('/');
  await page.locator('#new-project').click();
  await page.locator('#new-title').fill('Linked scrolling');
  await page.locator('#new-file').setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('Japanese source paragraph.\n\n'.repeat(150))});
  await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');
  await expect(editor.locator('#src-txt')).toContainText('Japanese source paragraph.',{timeout:15000});
  await editor.locator('#tl-out').fill('English translated paragraph of a different length.\n\n'.repeat(220));
  return editor;
}

for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test(`linked scrolling works in both directions at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);
    const editor=await editorWithLongText(page);
    if(viewport.width<851)await editor.locator('summary').filter({hasText:'Translation tools'}).click();
    const toggle=editor.locator('#host-linked-scroll');
    await expect(toggle).toHaveAttribute('aria-pressed','false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed','true');
    const ratio=locator=>locator.evaluate(node=>node.scrollTop/(node.scrollHeight-node.clientHeight));
    await editor.locator('#src-txt').evaluate(node=>{node.scrollTop=(node.scrollHeight-node.clientHeight)*0.5;});
    await expect.poll(()=>ratio(editor.locator('#tl-out'))).toBeCloseTo(0.5,2);
    await editor.locator('#tl-out').evaluate(node=>{node.scrollTop=(node.scrollHeight-node.clientHeight)*0.8;});
    await expect.poll(()=>ratio(editor.locator('#src-txt'))).toBeCloseTo(0.8,2);
    await toggle.click();
    await editor.locator('#src-txt').evaluate(node=>{node.scrollTop=0;});
    await expect.poll(()=>ratio(editor.locator('#tl-out'))).toBeCloseTo(0.8,2);
  });
}

test('quota meter distinguishes local work and shows completed, reserved, and remaining usage',async({page})=>{
  const editor=await editorWithLongText(page);
  const meter=editor.locator('#host-quota-meter');
  await expect(meter).toContainText('Local: no daily app limit');
  await page.evaluate(()=>{
    const frame=document.getElementById('editor');
    const id=new URL(location.href).searchParams.get('project');
    frame.contentWindow.postMessage({type:'host:quota',projectId:id,quota:{completed:16000,reserved:2000,remaining:12000,resetAt:new Date(Date.now()+3600000).toISOString()}},location.origin);
  });
  await expect(meter).toContainText('16,000 / 30,000 today');
  await expect(meter).toContainText('2,000 reserved');
  await expect(meter).toContainText('12,000 remaining');
  await expect(meter).toHaveAttribute('title',/00:00 UTC/);
});

test('guest API spending notice can be canceled and has no account preference checkbox',async({page})=>{
  const editor=await editorWithLongText(page);
  await editor.locator('#api-key').fill('sk-or-test-not-a-real-key');
  const notice=page.locator('.spending-notice');
  await expect(notice).toBeVisible();
  await expect(notice.locator('label')).toBeHidden();
  await expect(notice).toContainText('does not cap monetary spending');
  await notice.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(editor.locator('#api-key')).toHaveValue('');
});

test('Free premium actions show a crown and open the shared two-card upgrade dialog',async({page})=>{
  const editor=await editorWithLongText(page);
  await editor.locator('#host-tools').click();
  await expect(editor.locator('#host-consistency')).toContainText('Pro');
  await expect(editor.locator('#host-consistency svg')).toBeVisible();
  await editor.locator('#host-consistency').click();
  const dialog=page.locator('.upgrade-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-reason]')).toContainText('Consistency checking requires Pro');
  await expect(dialog.locator('.pricing-card')).toHaveCount(2);
  await dialog.getByRole('button',{name:'Close upgrade plans'}).click();
  await expect(editor.locator('#src-txt')).toContainText('Japanese source paragraph.');
  await editor.locator('#host-tools').click();
  await editor.locator('#host-custom-prompt').click();
  await expect(dialog.locator('[data-reason]')).toContainText('Teams');
});

test('local translation waits for spending consent and keeps the provider key out of host requests',async({page})=>{
  const editor=await editorWithLongText(page);
  const key='sk-or-unit-test-fake-provider-key';
  let calls=0;
  const leaked=[];
  page.on('request',request=>{
    if(new URL(request.url()).origin==='http://127.0.0.1:4173' && (request.postData()||'').includes(key))leaked.push(request.url());
  });
  await page.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
    calls++;
    expect(route.request().headers().authorization).toBe('Bearer '+key);
    await route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content:'A completed translation.'},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'});
  });
  await editor.locator('#model-select').evaluate(node=>{
    node.replaceChildren(new Option('Test model','or|unit-test-model',true,true));node.dispatchEvent(new Event('change'));
  });
  await editor.locator('#api-key').fill(key);
  await expect(page.locator('.spending-notice')).toBeVisible();
  expect(calls).toBe(0);
  await page.locator('.spending-notice').getByRole('button',{name:'Continue',exact:true}).click();
  await editor.locator('#btn-tl').click();
  await expect(editor.locator('#tl-out')).toHaveText('A completed translation.');
  expect(calls).toBe(1);
  expect(leaked).toEqual([]);
});
