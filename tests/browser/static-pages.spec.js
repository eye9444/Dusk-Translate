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
