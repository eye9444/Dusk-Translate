import {test,expect} from '@playwright/test';

for(const width of [390,1280])test(`new and import project checkbox stays beside its label at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const user={id:'44444444-4444-4444-8444-444444444444',email:'checkbox@example.test',aud:'authenticated',role:'authenticated'};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 await page.route('https://accounts.google.com/**',route=>route.abort());
 await page.route('**/api/paddle/status',route=>route.fulfill({json:{tier:'free'}}));
 await page.route('https://dusk-test.supabase.co/**',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/token'))return route.fulfill({json:{access_token:`${b64({alg:'HS256'})}.${b64({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})}.test`,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user}});
   if(url.pathname.endsWith('/user'))return route.fulfill({json:user});
   return route.fulfill({json:[]});
 });
 await page.goto('/');await page.locator('#account').click();
 await page.locator('#email').fill(user.email);await page.locator('#password').fill('TestPassword123!');await page.locator('#auth-submit').click();
 await expect(page.locator('#account')).toHaveText('Account');
 for(const button of ['#new-project','#import-project']){
   await page.locator(button).click();
   await expect(page.locator('#new-storage-label')).toBeVisible();
   const bounds=await page.locator('#new-storage-label').evaluate(label=>{
     const input=label.querySelector('input').getBoundingClientRect();
     const text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
     const range=document.createRange();range.selectNodeContents(text);
     const first=range.getClientRects()[0];
     return {input:{x:input.x,y:input.y,width:input.width,height:input.height},text:{x:first.x,y:first.y},overflow:label.scrollWidth>label.clientWidth};
   });
   expect(bounds.input.width).toBe(16);
   expect(Math.abs(bounds.input.y-bounds.text.y)).toBeLessThan(5);
   expect(bounds.text.x).toBeGreaterThan(bounds.input.x+bounds.input.width);
   expect(bounds.overflow).toBe(false);
   await page.locator('#new-storage-label').click();await expect(page.locator('#new-local')).toBeChecked();
   await page.screenshot({path:`test-results/checkbox-${width}-${button.slice(1)}.png`});
   await page.locator('#project-dialog [data-close]').click();
 }
});
