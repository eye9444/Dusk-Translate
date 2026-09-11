import {test,expect} from '@playwright/test';
test('signed-out welcome hides projects and offers authentication',async({page})=>{
  await page.goto('/');await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#library')).toBeHidden();
  await page.locator('#welcome-signup').click();await expect(page.locator('#auth-submit')).toHaveText('Create account');
  await expect(page.locator('#remember-me')).toBeChecked();await page.locator('#auth-dialog [data-close]').click();
  await page.locator('#welcome-guest').click();await expect(page.locator('#library')).toBeVisible();
  await page.locator('#brand').click();await expect(page.locator('#welcome')).toBeVisible();
  await page.reload();await expect(page.locator('#library')).toBeHidden();
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
