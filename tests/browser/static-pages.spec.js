import {test,expect} from '@playwright/test';

const pages=[
  ['/privacy.html','Privacy Policy'],
  ['/terms.html','Terms and Conditions'],
  ['/cookies.html','Cookie Policy'],
  ['/guides/api-keys.html','Bring your own AI key.']
];

test('static policy and setup pages are directly reachable',async({page})=>{
  for(const [path,title] of pages){
    const response=await page.goto(path);
    expect(response?.ok(),path).toBe(true);
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  }
});

test('policy and API guide links open outside the working tab',async({page})=>{
  await page.goto('/');
  for(const path of ['/privacy.html','/terms.html','/cookies.html','/guides/api-keys.html']){
    await expect(page.locator(`.legal-links a[href="${path}"]`)).toHaveAttribute('target','_blank');
    await expect(page.locator(`.legal-links a[href="${path}"]`)).toHaveAttribute('rel','noopener');
  }
});
