import {test,expect} from '@playwright/test';

async function openEditor(page){
  await page.addInitScript(()=>sessionStorage.setItem('dusk-guest','true'));
  await page.goto('/');await page.locator('#new-project').click();
  await page.locator('#new-title').fill('Review controls');
  await page.locator('#new-file').setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('Hello world, a source paragraph.\n\nAnother paragraph.')});
  await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');await expect(editor.locator('#src-txt')).toContainText('Hello world');return editor;
}

test('hover comment control remains clickable and uses the theme foreground',async({page})=>{
  const editor=await openEditor(page);
  await page.evaluate(()=>document.getElementById('editor').contentWindow.postMessage({type:'host:theme',theme:'eclipse'},location.origin));
  await expect(editor.locator('body')).toHaveClass(/eclipse/);
  await editor.locator('#src-txt').hover({position:{x:45,y:30}});
  const control=editor.getByRole('button',{name:'Comment on this line',exact:true});
  await expect(control).toBeVisible();await control.hover();
  await page.waitForTimeout(350);
  await expect(control).toBeVisible();
  expect(await control.evaluate(node=>{const span=document.createElement('span');span.style.color='var(--ink)';document.body.append(span);const matches=getComputedStyle(node).color===getComputedStyle(span).color;span.remove();return matches;})).toBe(true);
  await control.click();await expect(page.getByRole('textbox',{name:'New comment',exact:true})).toBeVisible();
});

test('ruby for other chapters does not clear readings or open the remove panel',async({page})=>{
  const editor=await openEditor(page);
  const ids=await editor.locator('#src-txt').evaluate(()=>({projectId,chapterId:novel.chapters[cur].id}));
  const fixture={type:'host:ruby',...ids,annotations:[{id:'ruby-test',chapterId:ids.chapterId,pane:'source',reading:'greeting',location:{start:0,end:5,quote:'Hello',status:'anchored'}}]};
  await page.evaluate(data=>document.getElementById('editor').contentWindow.postMessage(data,location.origin),fixture);
  await expect(editor.locator('.inline-ruby-reading')).toHaveText('greeting');
  await expect(editor.locator('#ruby-notes')).toBeHidden();
  await page.evaluate(data=>{for(let i=0;i<10;i++)document.getElementById('editor').contentWindow.postMessage({...data,chapterId:'other-chapter',annotations:[]},location.origin);},fixture);
  await expect(editor.locator('.inline-ruby-reading')).toHaveText('greeting');
  await expect(editor.locator('#ruby-notes')).toBeHidden();
});

test('image dialog has a persistent X and dismisses from the backdrop',async({page})=>{
  const editor=await openEditor(page);
  await editor.locator('#host-tools').click();await editor.locator('#host-images').click();
  await expect(page.getByRole('button',{name:'Close book images'})).toBeVisible();
  await page.locator('#image-preview-dialog').evaluate(dialog=>dialog.showModal());
  await page.getByRole('button',{name:'Close image preview'}).click();
  await expect(page.locator('#images-dialog')).toBeVisible();
  await page.locator('#images-list').evaluate(node=>{node.style.height='1600px';});
  await page.locator('#images-dialog').evaluate(node=>{node.scrollTop=node.scrollHeight;});
  await expect(page.getByRole('button',{name:'Close book images'})).toBeInViewport();
  await page.getByRole('button',{name:'Close book images'}).click();await expect(page.locator('#images-dialog')).toBeHidden();
  await editor.locator('#host-tools').click();await editor.locator('#host-images').click();
  await page.mouse.click(2,2);await expect(page.locator('#images-dialog')).toBeHidden();
  expect(await page.locator('#images-dialog').evaluate(node=>getComputedStyle(node).boxShadow)).not.toContain('inset');
});
