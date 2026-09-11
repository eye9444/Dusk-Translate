import {test,expect} from '@playwright/test';
const user={id:'44444444-4444-4444-8444-444444444444',email:'cloud@example.test',aud:'authenticated',role:'authenticated'};
function session(){const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');return {access_token:`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})}.test`,refresh_token:'cloud-test-refresh',token_type:'bearer',expires_in:3600,user};}
async function backend(context,state){
  await context.route('https://dusk-test.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    if(url.pathname.endsWith('/token'))return route.fulfill({json:session()});
    if(url.pathname.endsWith('/user'))return route.fulfill({json:user});
    if(url.pathname.endsWith('/settings'))return route.fulfill({json:{external:{google:true,email:true}}});
    if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
    if(url.pathname.includes('/storage/v1/object/')){
      if(method==='POST'){state.uploaded=req.postDataBuffer().toString().includes('Original test chapter');return route.fulfill({json:{Key:'books/test'}});}
      return route.fulfill({contentType:'text/plain',body:state.source});
    }
    if(url.pathname.includes('/rest/v1/projects')){
      if(method==='GET'){
        if(state.failList)return route.fulfill({status:503,json:{message:'Temporarily unavailable'}});
        if(url.searchParams.get('limit')==='0')return route.fulfill({json:[]});
        if(url.searchParams.has('id'))return route.fulfill({json:state.row});
        const row=state.row?{...state.row}:null;if(row)delete row.snapshot;
        return route.fulfill({json:row?[row]:[]});
      }
      if(method==='POST'){state.row={...req.postDataJSON(),revision:1,archived:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};return route.fulfill({json:state.row});}
      if(method==='PATCH'){
        if(state.failSave)return route.fulfill({status:503,json:{message:'Temporarily unavailable'}});
        if(url.searchParams.get('revision')!==`eq.${state.row.revision}`)return route.fulfill({json:[]});
        state.row={...state.row,...req.postDataJSON(),revision:state.row.revision+1,updated_at:new Date().toISOString()};return route.fulfill({json:[state.row]});
      }
    }
    return route.fulfill({json:{}});
  });
}
async function signin(page,remember=true){
  await page.goto('/');await page.locator('#account').click();await page.locator('#email').fill(user.email);await page.locator('#password').fill('TestPassword123!');
  await page.locator('#remember-me').setChecked(remember);await page.locator('#auth-submit').click();await expect(page.locator('#account')).toHaveText('Sign out');
}
test('cloud saves original, translation, glossary and position across a fresh browser',async({page,context,browser})=>{
  const state={source:'Original test chapter\n\nA second paragraph.'};await backend(context,state);await signin(page);
  await page.locator('#new-project').click();await page.locator('#new-title').fill('Cloud book');await page.locator('#new-file').setInputFiles({name:'cloud.txt',mimeType:'text/plain',buffer:Buffer.from(state.source)});await page.locator('#create-submit').click();
  const editor=page.frameLocator('#editor');await expect(editor.locator('#src-txt')).toContainText('Original test chapter');
  await editor.locator('#tl-out').fill('A saved cloud translation.');await editor.getByRole('button',{name:'Glossary',exact:true}).click();await editor.locator('#glossary').fill('name = Name');
  await editor.locator('#api-key').fill('DO_NOT_SAVE_THIS_PROVIDER_KEY');await expect(page.locator('#save-status')).toHaveText('Saved to your account');
  expect(state.uploaded).toBe(true);expect(JSON.stringify(state.row)).not.toContain('DO_NOT_SAVE');expect(state.row.snapshot.glossary).toBe('name = Name');
  const other=await browser.newContext({baseURL:'http://127.0.0.1:4174'});await backend(other,state);
  try{
    const second=await other.newPage();await second.goto('http://127.0.0.1:4174/');await signin(second);
    await second.getByRole('button',{name:'Open project',exact:true}).click();
    await expect(second.frameLocator('#editor').locator('#tl-out')).toHaveText('A saved cloud translation.');
    await expect(second.frameLocator('#editor').locator('#api-key')).toHaveValue('');
  }finally{await other.close();}
});
test('failed cloud sync retains a resumable local draft and can retry',async({page,context})=>{
  const state={source:'Original test chapter'};await backend(context,state);await signin(page);
  const editor=page.frameLocator('#editor');
  await page.locator('#new-project').click();await page.locator('#new-title').fill('Retry book');await page.locator('#new-file').setInputFiles({name:'retry.txt',mimeType:'text/plain',buffer:Buffer.from(state.source)});await page.locator('#create-submit').click();
  await expect(page.locator('#save-status')).toHaveText('Saved to your account');state.failSave=true;
  await page.frameLocator('#editor').locator('#tl-out').fill('Keep this offline draft.');await expect(page.locator('#save-status')).toContainText('retry');
  page.on('dialog',dialog=>dialog.accept());await editor.locator('#host-menu').click();await editor.locator('#host-library').click();await expect(page.locator('#library')).toBeVisible();
  state.failList=true;await page.locator('#refresh').click();await expect(page.locator('#library-status')).toContainText('cached',{timeout:15000});
  await page.getByRole('button',{name:'Open project',exact:true}).click();await expect(page.frameLocator('#editor').locator('#tl-out')).toHaveText('Keep this offline draft.');
  state.failSave=false;state.failList=false;await editor.locator('#host-menu').click();await editor.locator('#host-save').click();await expect(page.locator('#save-status')).toHaveText('Saved to your account');expect(Object.values(state.row.snapshot.translations)).toContain('Keep this offline draft.');
});
test('unchecked remember me keeps login tokens out of persistent storage',async({page,context})=>{
  const state={};await backend(context,state);await signin(page,false);
  const tokens=await page.evaluate(()=>({persistent:localStorage.getItem('sb-dusk-test-auth-token'),session:sessionStorage.getItem('sb-dusk-test-auth-token')}));
  expect(tokens.persistent).toBeNull();expect(tokens.session).toBeTruthy();await page.reload();await expect(page.locator('#account')).toHaveText('Sign out');
  await page.locator('#account').click();await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#library')).toBeHidden();
});
