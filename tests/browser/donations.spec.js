import { test, expect } from '@playwright/test';

test('community pricing route opens optional support without loading checkout', async ({page}) => {
  const requests=[];
  page.on('request',request=>requests.push(request.url()));
  await page.goto('/pricing');
  await expect(page.locator('.support-dialog')).toBeVisible();
  await expect(page.locator('#pricing')).toBeHidden();
  await expect(page.locator('.support-dialog')).toContainText('coming soon');
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
  await expect(page.locator('.support-dialog')).toContainText('star the repository');
  await expect(page.locator('.support-dialog')).toContainText('optimising the site');
  await page.locator('.support-dialog [data-close]').click();
  await expect(page.locator('.support-dialog')).toBeHidden();
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
