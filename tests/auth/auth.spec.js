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
  await expect(page.locator('#auth-message')).toContainText('If that email has an account');
  expect(new URL(redirect).origin).toBe('http://127.0.0.1:4174');expect(new URL(redirect).pathname).toBe('/');
  await expect(page.locator('#google-option')).toBeHidden();
});

for(const mode of ['signin','signup'])test(`Google ${mode} starts PKCE without email or password`,async({page})=>{
  let authorization;
  await page.route('https://dusk-test.supabase.co/auth/v1/authorize**',async route=>{
    authorization=new URL(route.request().url());
    await route.fulfill({contentType:'text/html',body:'<h1>Mock Google authorization</h1>'});
  });
  await page.goto('/');await page.locator('#account').click();
  if(mode==='signup')await page.locator('#auth-switch').click();
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await expect(page.getByRole('heading')).toHaveText('Mock Google authorization');
  expect(authorization.searchParams.get('provider')).toBe('google');
  expect(authorization.searchParams.get('prompt')).toBe('select_account');
  expect(authorization.searchParams.get('code_challenge_method')).toBe('s256');
  expect(authorization.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
  const redirect=new URL(authorization.searchParams.get('redirect_to'));
  expect(redirect.origin).toBe('http://127.0.0.1:4174');expect(redirect.pathname).toBe('/');
});

test('Google callback exchanges code once, persists session, and signs out',async({page})=>{
  const user={id:'22222222-2222-4222-8222-222222222222',email:'google@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'google'}};
  let exchanges=0,callback;
  await page.route('https://dusk-test.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/authorize')){
      callback=new URL(url.searchParams.get('redirect_to'));callback.searchParams.set('code','test-google-code');
      return route.fulfill({status:302,headers:{location:callback.href}});
    }
    if(url.pathname.endsWith('/token')){
      exchanges++;expect(url.searchParams.get('grant_type')).toBe('pkce');
      const body=route.request().postDataJSON();expect(body.auth_code).toBe('test-google-code');expect(body.code_verifier.length).toBeGreaterThanOrEqual(43);
      const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
      const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})}.test`;
      return route.fulfill({json:{access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user}});
    }
    if(url.pathname.includes('/rest/v1/projects'))return route.fulfill({json:[]});
    if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
    if(url.pathname.endsWith('/user'))return route.fulfill({json:user});
    return route.fulfill({json:{}});
  });
  await page.goto('/');await page.locator('#account').click();await page.locator('#google-auth').click();
  await expect(page.locator('#account')).toHaveText('Sign out');
  await expect(page.locator('#storage-info')).toContainText(user.email);
  await expect(page).toHaveURL('http://127.0.0.1:4174/');expect(exchanges).toBe(1);
  await page.reload();await expect(page.locator('#storage-label')).toHaveText('YOUR CLOUD LIBRARY');expect(exchanges).toBe(1);
  await page.locator('#account').click();await expect(page.locator('#storage-label')).toHaveText('THIS BROWSER');
});

for(const separator of ['?','#'])test(`cancelled Google callback ${separator} is explained and removed from URL`,async({page})=>{
  await page.goto(`/${separator}error=access_denied&error_description=User%20cancelled&sb_flow_id=test-flow`);
  await expect(page.locator('#auth-dialog')).toBeVisible();
  await expect(page.locator('#auth-message')).toContainText('cancelled');
  await expect(page.locator('#google-auth')).toBeEnabled();
  await expect(page).toHaveURL('http://127.0.0.1:4174/');
  await page.reload();await expect(page.locator('#auth-dialog')).not.toBeVisible();
});

test('callback without its browser verifier shows a retry instead of silent failure',async({page})=>{
  await page.goto('/?code=expired-code&sb_flow_id=missing-flow');
  await expect(page.locator('#auth-message')).toContainText('different browser');
  await expect(page.locator('#account')).toHaveText('Sign in');
  await expect(page).toHaveURL('http://127.0.0.1:4174/');
});

test('failed code exchange stays signed out and offers another attempt',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('sb-dusk-test-auth-token-code-verifier',JSON.stringify('a'.repeat(64))));
  await page.route('https://dusk-test.supabase.co/auth/v1/token**',route=>route.fulfill({status:400,json:{code:'bad_code_verifier',msg:'Invalid or expired sign-in code'}}));
  await page.goto('/?code=bad-code');
  await expect(page.locator('#auth-message')).toContainText('Invalid or expired');
  await expect(page.locator('#google-auth')).toBeEnabled();
  await expect(page.locator('#account')).toHaveText('Sign in');
  await expect(page).toHaveURL('http://127.0.0.1:4174/');
});

test('PKCE password recovery opens password update, not Google login',async({page})=>{
  const user={id:'33333333-3333-4333-8333-333333333333',email:'recovery@example.test',aud:'authenticated',role:'authenticated'};
  let resetURL,updated=false;
  await page.route('https://dusk-test.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/recover')){resetURL=new URL(url.searchParams.get('redirect_to'));return route.fulfill({json:{}});}
    if(url.pathname.endsWith('/token')){
      const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
      const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})}.test`;
      return route.fulfill({json:{access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user}});
    }
    if(url.pathname.includes('/rest/v1/projects'))return route.fulfill({json:[]});
    if(url.pathname.endsWith('/user')){
      if(route.request().method()==='PUT'){expect(route.request().postDataJSON().password).toBe('NewPassword123!');updated=true;}
      return route.fulfill({json:user});
    }
    return route.fulfill({json:{}});
  });
  await page.goto('/');await page.locator('#account').click();await page.locator('#forgot').click();
  await page.locator('#email').fill(user.email);await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('If that email has an account');
  resetURL.searchParams.set('code','recovery-code');await page.goto(resetURL.href);
  await expect(page.locator('#auth-title')).toHaveText('Choose a new password.');
  await expect(page.locator('#google-option')).toBeHidden();
  await page.locator('#password').fill('NewPassword123!');await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible();expect(updated).toBe(true);
});

test('account forms fit mobile in both themes',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  for(const theme of ['light','eclipse']){
    if(theme==='eclipse')await page.locator('#theme').click();
    await page.locator('#account').click();
    await expect(page.locator('#google-auth')).toBeInViewport();
    await expect(page.locator('#auth-submit')).toBeInViewport();
    expect(await page.locator('#auth-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`account-${theme}.png`)});
    await page.locator('#auth-dialog [data-close]').click();
  }
});
