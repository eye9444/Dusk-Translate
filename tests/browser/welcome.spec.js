import {test,expect} from '@playwright/test';
test('touch rotation interpolates between samples and stops rendering when hidden',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const art=page.locator('.welcome-art');
  await art.scrollIntoViewIfNeeded();
  const box=await art.boundingBox();
  const client=await page.context().newCDPSession(page);
  const point={x:box.x+box.width*.3,y:box.y+box.height*.5};
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  const before=Number(await art.getAttribute('data-rotation'));
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:point.x+90}]});
  await page.waitForTimeout(20);
  const first=Number(await art.getAttribute('data-rotation'));
  await page.waitForTimeout(120);
  const later=Number(await art.getAttribute('data-rotation'));
  expect(first).toBeGreaterThan(before);
  expect(later).toBeGreaterThan(first);
  expect(await page.evaluate(()=>getSelection().toString())).toBe('');
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('#welcome-guest').click();
  await expect(art).toBeHidden();
  await page.waitForTimeout(100);
  const stopped=await art.getAttribute('data-rotation');
  await page.waitForTimeout(150);
  expect(await art.getAttribute('data-rotation')).toBe(stopped);
});
test('signed-out welcome hides projects and offers authentication',async({page})=>{
  await page.goto('/');await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#library')).toBeHidden();
  await page.locator('#welcome-signup').click();await expect(page.locator('#auth-submit')).toHaveText('Create account');
  await expect(page.locator('#remember-me')).toBeChecked();await page.locator('#auth-dialog [data-close]').click();
  await page.locator('#welcome-guest').click();await expect(page.locator('#library')).toBeVisible();
  await page.locator('#brand').click();await expect(page.locator('#welcome')).toBeVisible();
  await page.reload();await expect(page.locator('#library')).toBeHidden();
});
test('public feature page is crawlable and usable on mobile',async({page})=>{
  await page.setViewportSize({width:320,height:760});
  await page.goto('/features.html');
  await expect(page).toHaveTitle(/Book and Web Novel Translation Features/);
  await expect(page.getByRole('heading',{name:'A translation room built around the whole book.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Start translating'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
test('welcome layout fits desktop and mobile in both themes',async({page})=>{
  for(const width of [1920,390,320]){
    await page.setViewportSize({width,height:1080});await page.goto('/');
    for(const theme of ['dusk','eclipse']){
      await page.evaluate(theme=>{localStorage.setItem('theme',theme);location.reload();},theme);
      await page.waitForLoadState();await expect(page.locator('#welcome')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({path:`/tmp/dusk-welcome-${theme}-${width}.png`,fullPage:true,animations:'disabled'});
    }
  }
});
test('primary actions use accessible white text on the deeper orange',async({page})=>{
  await page.goto('/');
  for(const theme of ['dusk','eclipse']){
    await page.evaluate(theme=>{localStorage.setItem('theme',theme);location.reload();},theme);
    await expect(page.locator('#welcome-signin')).toHaveCSS('background-color','rgb(185, 71, 45)');
    await expect(page.locator('#welcome-signin')).toHaveCSS('color','rgb(255, 255, 255)');
  }
  await page.locator('#welcome-guest').click();
  await expect(page.locator('#new-project')).toHaveCSS('background-color','rgb(185, 71, 45)');
  await expect(page.locator('#new-project')).toHaveCSS('color','rgb(255, 255, 255)');
});

test('signed-out welcome never automatically opens release notes',async({page})=>{
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#welcome-signin')).toBeVisible();
  await page.clock.fastForward(20000);
  await expect(page.locator('#whats-new-dialog')).toBeHidden();
});

test('the welcome planet spins, fades its cards, and rewards sustained rotation',async({page})=>{
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<p>Video player fixture</p>'}));
  await page.setViewportSize({width:1440,height:900});await page.goto('/');
  const art=page.locator('.welcome-art'),box=await art.boundingBox();
  const visibleMoonLayers=await art.locator('.moon-revolution').evaluateAll((layers)=>layers.filter((layer)=>getComputedStyle(layer).visibility!=='hidden').length);
  expect(visibleMoonLayers).toBe(1);
  await expect(art.locator('.planet-surface')).toHaveCount(0);
  await page.mouse.move(box.x+120,box.y+box.height/2);await page.mouse.down();
  const heldRotation=await art.getAttribute('data-rotation');
  await page.waitForTimeout(300);
  expect(await art.getAttribute('data-rotation')).toBe(heldRotation);
  await expect(art.locator('.source-page')).toHaveCSS('opacity','1');
  await page.mouse.move(box.x+520,box.y+box.height/2,{steps:4});
  await expect(art.locator('.source-page')).toHaveCSS('opacity','0');
  await expect(art.locator('.translated-page')).toHaveCSS('opacity','0');
  await expect(art.locator('.source-page')).toHaveCSS('filter','none');
  expect(Number(await art.getAttribute('data-rotation'))).toBeGreaterThan(Number(heldRotation));
  expect(await art.locator('.orbit-front').getAttribute('transform')).toBe(await art.locator('.orbit-back').getAttribute('transform'));
  for(let index=0;index<5;index++){
    await page.mouse.move(box.x+120,box.y+box.height/2,{steps:2});
    await page.mouse.move(box.x+520,box.y+box.height/2,{steps:2});
  }
  await expect(page.locator('#heaven-sequence')).toBeHidden();
  expect(await page.evaluate(()=>getSelection().toString())).toBe('');
  for(let index=0;index<12;index++){
    await page.mouse.move(box.x+120,box.y+box.height/2,{steps:2});
    await page.mouse.move(box.x+520,box.y+box.height/2,{steps:2});
  }
  await expect(page.locator('#heaven-sequence')).toBeVisible();
  await expect(page.locator('#heaven-sequence iframe')).toHaveAttribute('src',/youtube-nocookie.com\/embed\/jWOetWUeAts/);
  await page.mouse.up();
  await page.getByRole('button',{name:'Close Esc'}).click();
  await expect(page.locator('#heaven-sequence')).toBeHidden();
  await expect(page.locator('#heaven-sequence iframe')).not.toHaveAttribute('src');
  await expect(page.locator('#welcome')).not.toHaveAttribute('inert');
  await expect(art.locator('.source-page')).toHaveCSS('opacity','1');
});
