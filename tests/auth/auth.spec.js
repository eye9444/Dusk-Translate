import {test,expect} from '@playwright/test';
test('email signup confirmation, login errors, login and logout',async({page})=>{
  const user={id:'11111111-1111-4111-8111-111111111111',email:'reader@example.test',aud:'authenticated',role:'authenticated'};
  let attempts=0;
  await page.route('https://dusk-test.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/signup'))return route.fulfill({json:{user,session:null}});
    if(url.pathname.endsWith('/token')){
      if(!attempts++)return route.fulfill({status:400,json:{error:'invalid_grant',error_description:'Invalid login credentials'}});
      const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
      const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})}.test`;
      return route.fulfill({json:{access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user}});
    }
    if(url.pathname.includes('/rest/v1/projects'))return route.fulfill({json:[]});
    if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
    if(url.pathname.endsWith('/user'))return route.fulfill({json:user});
    return route.fulfill({json:{}});
  });
  await page.goto('/');await page.locator('#account').click();await page.locator('#auth-switch').click();
  await page.locator('#email').fill(user.email);await page.locator('#password').fill('TestPassword123!');await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('confirm your account');
  await page.locator('#auth-switch').click();await page.locator('#password').fill('WrongPassword123');await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('Invalid login');
  await page.locator('#password').fill('TestPassword123!');await page.locator('#auth-submit').click();
  await expect(page.locator('#account')).toHaveText('Sign out');await expect(page.locator('#storage-label')).toHaveText('YOUR CLOUD LIBRARY');
  await page.locator('#account').click();await expect(page.locator('#storage-label')).toHaveText('THIS BROWSER');
});
test('forgot password gives neutral confirmation and same-origin redirect',async({page})=>{
  let redirect;
  await page.route('https://dusk-test.supabase.co/**',async route=>{
    redirect=new URL(route.request().url()).searchParams.get('redirect_to');return route.fulfill({json:{}});
  });
  await page.goto('/');await page.locator('#account').click();await page.locator('#forgot').click();await page.locator('#email').fill('reader@example.test');await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('If that email has an account');expect(redirect).toBe('http://127.0.0.1:4174/');
});
