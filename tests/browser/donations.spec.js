import { test, expect } from '@playwright/test';

test('community pricing route opens optional support without loading checkout', async ({page}) => {
  const requests=[];
  page.on('request',request=>requests.push(request.url()));
  await page.goto('/pricing');
  await expect(page.locator('.support-dialog')).toBeVisible();
  await expect(page.locator('#pricing')).toBeHidden();
  const dialog=page.locator('.support-dialog');
  await expect(dialog).toContainText('Any amount helps');
  await expect(dialog).not.toContainText('coming soon');
  const paypal=dialog.getByRole('link',{name:'Donate via PayPal'});
  await expect(paypal).toHaveAttribute('href','https://paypal.me/eye9444');
  await expect(paypal).toHaveAttribute('target','_blank');
  await expect(paypal).toHaveAttribute('rel','noopener noreferrer');
  await expect(paypal.locator('svg')).toBeVisible();
  expect(requests.some(url=>url.includes('cdn.paddle.com'))).toBe(false);
});

test('donation notice is home-only, dismissible, and shown once per session',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.support-notice')).toBeHidden();
  await page.locator('#welcome-guest').click();
  await expect(page.locator('.support-notice')).toBeVisible();
  await page.getByRole('button',{name:'Dismiss donation reminder'}).click();
  await expect(page.locator('.support-notice')).toBeHidden();
  await page.reload();
  await expect(page.locator('#library')).toBeVisible();
  await expect(page.locator('.support-notice')).toBeHidden();
  await page.locator('#pricing-nav-link').click();
  await expect(page.locator('.support-dialog')).toBeVisible();
  const github = page.locator('.support-dialog').getByRole('link', {name:'Support on GitHub'});
  await expect(github).toHaveAttribute('href','https://github.com/eye9444/Dusk-Translate');
  await expect(github).toHaveAttribute('rel','noopener noreferrer');
  await expect(github.locator('svg')).toBeVisible();
  await expect(page.locator('.support-dialog')).toContainText('star the repository');
  await expect(page.locator('.support-dialog')).toContainText('optimising the site');
  await page.locator('.support-dialog [data-close]').click();
  await expect(page.locator('.support-dialog')).toBeHidden();
});

for(const theme of ['dusk','eclipse'])test(`support icons remain accessible on mobile in ${theme}`,async({page},testInfo)=>{
  await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.setViewportSize({width:320,height:568});
  await page.goto('/pricing');
  const dialog=page.locator('.support-dialog');
  for(const name of ['Donate via PayPal','Support on GitHub']){
    const link=dialog.getByRole('link',{name});
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport();
    await link.focus();await expect(link).toBeFocused();
    const box=await link.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`support-${theme}.png`)});
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});

test('donation notice expires after ten seconds and Sure opens its panel',async({page})=>{
  await page.clock.install();
  await page.goto('/');
  await page.locator('#welcome-guest').click();
  await expect(page.locator('.support-notice')).toBeVisible();
  await page.clock.fastForward(10000);
  await expect(page.locator('.support-notice')).toBeHidden();
  await page.evaluate(()=>sessionStorage.removeItem('dusk-support-notice-v1'));
  await page.reload();
  await expect(page.locator('.support-notice')).toBeVisible();
  await page.locator('.support-notice [data-sure]').click();
  await expect(page.locator('.support-dialog')).toBeVisible();
  await expect(page.locator('.support-notice')).toBeHidden();
});
