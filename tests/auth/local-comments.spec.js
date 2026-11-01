import {test,expect} from '@playwright/test';
import {LATEST_RELEASE_ID} from '../../web/src/releases.js';

test('signed-in local project comments survive reopening without a cloud comment request',async({page},testInfo)=>{
  const user={id:'44444444-4444-4444-8444-444444444444',email:'local-comments@example.test',aud:'authenticated',role:'authenticated',user_metadata:{translation_language_pair:{sourceLanguage:'ja',targetLanguage:'en'}}};
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const session={access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})}.test`,refresh_token:'local-comment-fixture',token_type:'bearer',expires_in:3600,user};
  const cloudComments=[];
  await page.route('**/api/account-preferences',route=>route.fulfill({json:{lastSeenRelease:LATEST_RELEASE_ID}}));
  await page.route('**/api/paddle/status',route=>route.fulfill({json:{tier:'advanced'}}));
  await page.route('https://dusk-test.supabase.co/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/token'))return route.fulfill({json:session});
    if(path.endsWith('/user'))return route.fulfill({json:user});
    if(path.endsWith('/rpc/list_project_comments')||path.endsWith('/rpc/write_project_comment')){
      cloudComments.push(path);return route.fulfill({status:403,json:{message:'No cloud project exists for this local book'}});
    }
    if(path.endsWith('/rpc/is_feedback_admin'))return route.fulfill({json:false});
    return route.fulfill({json:[]});
  });
  await page.goto('/');await page.locator('#account').click();
  await page.locator('#email').fill(user.email);await page.locator('#password').fill('SyntheticPassword123!');await page.locator('#auth-submit').click();
  await expect(page.locator('#account')).toHaveText('Account');
  await page.locator('#new-project').click();await page.locator('#new-title').fill('Local comment regression');
  await page.locator('#new-local').check();
  await page.locator('#new-file').setInputFiles({name:'local.txt',mimeType:'text/plain',buffer:Buffer.from('Hello world, a synthetic passage.')});
  await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');
  await expect(editor.locator('#src-txt')).toContainText('Hello world');
  await editor.locator('#src-txt').evaluate(root=>{
    const range=document.createRange();range.setStart(root.firstChild,6);range.setEnd(root.firstChild,11);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  });
  await editor.locator('#host-tools').click();await editor.locator('#host-comments').click();
  await page.getByRole('textbox',{name:'New comment',exact:true}).fill('An account-local note');
  await page.getByRole('button',{name:'Post comment',exact:true}).click();
  await expect(page.locator('.comment-message')).toContainText('An account-local note');
  const saved=await page.evaluate(async()=>{
    const {local}=await import('/src/store.js');const [project]=await local.list('44444444-4444-4444-8444-444444444444');
    return {storage:project.storage,own:await local.comments(project.owner,project.id),guest:await local.comments('guest',project.id)};
  });
  expect(saved.storage).toBe('local');expect(saved.own[0].messages[0].author_id).toBe(user.id);expect(saved.guest).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('signed-in-local-comments.png')});
  await page.reload();await page.locator('.project-card').first().click();
  await expect(editor.locator('#src-txt')).toContainText('Hello world');
  await editor.locator('#host-tools').click();await editor.locator('#host-comments').click();
  await expect(page.locator('.comment-message')).toContainText('An account-local note');
  expect(cloudComments).toEqual([]);
});
