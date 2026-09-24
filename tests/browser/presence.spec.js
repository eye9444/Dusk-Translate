import { test, expect } from '@playwright/test';

test('presence avatars and matching remote cursors stay outside editable content',async ({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('dusk-guest','true'));
  await page.goto('/');
  await page.locator('#new-project').click();
  await page.locator('#new-title').fill('Presence test');
  await page.locator('#new-file').setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('A source paragraph for shared cursor testing.')});
  await page.getByRole('button',{name:'Create project',exact:true}).click();
  const editor=page.frameLocator('#editor');
  await expect(editor.locator('#src-txt')).toContainText('A source paragraph');
  await page.evaluate(()=>window.addEventListener('message',event=>{
    if(event.source===document.getElementById('editor').contentWindow && event.data.type==='editor:presence-location') window.observedPresence=event.data.location;
  }));
  await editor.locator('#src-txt').evaluate(root=>{
    const range=document.createRange();range.setStart(root.firstChild,5);range.collapse(true);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  });
  await expect.poll(()=>page.evaluate(()=>window.observedPresence?.offset)).toBe(5);
  await page.evaluate(()=>{
    const location={...window.observedPresence,visible:true,active:true};
    window.presenceFixture={type:'host:presence',selfId:'self',members:[
      {user_id:'peer',display_name:'Other Editor',online:true,location},
      {user_id:'offline',display_name:'Offline Member',online:false,location:{}},
    ]};
    document.getElementById('editor').contentWindow.postMessage(window.presenceFixture,window.location.origin);
  });
  await expect(editor.locator('.collaborator-avatar[data-online="true"]')).toHaveAttribute('aria-label','Other Editor: Editing');
  await expect(editor.locator('.collaborator-avatar[data-online="false"]')).toHaveAttribute('aria-label','Offline Member: Offline');
  await expect(editor.locator('.collaborator-caret')).toHaveCount(1);
  await expect(editor.locator('#src-txt')).not.toContainText('Other Editor');
  await page.evaluate(()=>{
    window.presenceFixture.members[0].location.fingerprint='different-document';
    document.getElementById('editor').contentWindow.postMessage(window.presenceFixture,location.origin);
  });
  await expect(editor.locator('.collaborator-caret')).toHaveCount(0);
  await page.evaluate(()=>document.getElementById('editor').contentWindow.postMessage({type:'host:presence',unavailable:true},location.origin));
  await expect(editor.locator('#collaborator-presence')).toHaveText('Presence unavailable');
});
