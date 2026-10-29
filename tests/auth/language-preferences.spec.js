import {test,expect} from '@playwright/test';
import {LATEST_RELEASE_ID} from '../../web/src/releases.js';

const baseUser={id:'77777777-7777-4777-8777-777777777777',email:'languages@example.test',aud:'authenticated',role:'authenticated'};
async function backend(context,state){
  await context.route('https://accounts.google.com/**',route=>route.abort());
  await context.route('**/api/account-preferences',route=>route.fulfill({json:{lastSeenRelease:LATEST_RELEASE_ID}}));
  await context.route('https://dusk-test.supabase.co/**',route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path.endsWith('/signup')){
      state.user.user_metadata={...state.user.user_metadata,...request.postDataJSON().data};
      return route.fulfill({json:{user:state.user,session:null}});
    }
    if(path.endsWith('/token')){
      const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
      return route.fulfill({json:{access_token:`${b64({alg:'HS256'})}.${b64({sub:state.user.id,exp:Math.floor(Date.now()/1000)+3600})}.test`,refresh_token:'language-test-refresh',token_type:'bearer',expires_in:3600,user:state.user}});
    }
    if(path.endsWith('/user')){
      if(request.method()==='PUT'){
        if(state.failSave)return route.fulfill({status:503,json:{message:'Save unavailable'}});
        state.user.user_metadata={...state.user.user_metadata,...request.postDataJSON().data};state.saves++;
      }
      return route.fulfill({json:state.user});
    }
    return route.fulfill({json:[]});
  });
}
async function login(page){
  await page.goto('/');await page.locator('#account').click();await page.locator('#email').fill(baseUser.email);
  await page.locator('#password').fill('TestPassword123!');await page.locator('#auth-submit').click();await expect(page.locator('#account')).toHaveText('Account');
}
test('account language choice survives an entirely new browser context',async({page,context,browser,baseURL})=>{
  const state={user:{...baseUser,user_metadata:{}},saves:0};await backend(context,state);await login(page);
  await page.locator('#account').click();await page.getByRole('button',{name:'Editor preferences',exact:true}).click();
  const dialog=page.locator('#editor-preferences-dialog');await dialog.getByLabel('Default translation pair').selectOption('en|zh-Hans');
  await dialog.getByRole('button',{name:'Save preferences'}).click();await expect(dialog).toHaveCount(0);
  expect(state.user.user_metadata.translation_language_pair).toEqual({sourceLanguage:'en',targetLanguage:'zh-Hans'});
  const fresh=await browser.newContext({baseURL});
  try{
    await backend(fresh,state);const other=await fresh.newPage();await login(other);await other.locator('#new-project').click();
    await expect(other.locator('#new-source-language')).toHaveValue('en');await expect(other.locator('#new-target-language')).toHaveValue('zh-Hans');
  }finally{await fresh.close();}
});
test('email registration offers the default pair after confirmation and only until it is saved',async({page,context})=>{
  const state={user:{...baseUser,user_metadata:{}},saves:0};await backend(context,state);
  await page.goto('/');await page.locator('#account').click();await page.locator('#auth-switch').click();
  await page.locator('#email').fill(baseUser.email);await page.locator('#password').fill('TestPassword123!');await page.locator('#terms-accept').check();await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('confirm your account');
  expect(state.user.user_metadata.dusk_language_setup_pending).toBe(true);
  await page.locator('#auth-switch').click();await page.locator('#password').fill('TestPassword123!');await page.locator('#auth-submit').click();
  const dialog=page.locator('#editor-preferences-dialog');await expect(dialog).toContainText('What do you usually translate?');
  await dialog.getByLabel('Default translation pair').selectOption('ko|en');await dialog.getByRole('button',{name:'Save preferences'}).click();await expect(dialog).toHaveCount(0);
  await page.reload();await expect(page.locator('#account')).toHaveText('Account');await expect(dialog).toHaveCount(0);
  await page.locator('#new-project').click();await expect(page.locator('#new-source-language')).toHaveValue('ko');await expect(page.locator('#new-target-language')).toHaveValue('en');
});
test('failed account saves remain editable and do not publish an unsaved language choice',async({page,context})=>{
  const state={user:{...baseUser,user_metadata:{}},saves:0,failSave:true};await backend(context,state);await login(page);
  await page.locator('#account').click();await page.getByRole('button',{name:'Editor preferences',exact:true}).click();
  const dialog=page.locator('#editor-preferences-dialog');await dialog.getByLabel('Default translation pair').selectOption('ja|ko');await dialog.getByRole('button',{name:'Save preferences'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not save');await expect(dialog.getByRole('button',{name:'Save preferences'})).toBeEnabled();expect(state.saves).toBe(0);
});
