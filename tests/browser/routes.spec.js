import { test, expect } from '@playwright/test';

const fixture = { chapters:[{id:'p-001',text:'ルートのテストです。',jp_char_count:9}] };

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => sessionStorage.setItem('dusk-guest', 'true'));
});

test('guest landing redirects to home and project opens on an editor URL', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('#library')).toBeVisible();

  await page.locator('#new-project').click();
  await page.locator('#new-title').fill('Route test');
  await page.locator('#new-file').setInputFiles({ name:'route.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(fixture)) });
  await page.getByRole('button', { name:'Create project', exact:true }).click();
  await expect(page.frameLocator('#editor').locator('#src-txt')).toContainText('ルートのテストです。');
  await expect(page).toHaveURL(/\/editor\?project=/);

  const editor = page.frameLocator('#editor');
  await editor.locator('#host-menu').click();
  await editor.locator('#host-library').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('#library')).toBeVisible();
});

test('reader route opens a standalone reader page without a project', async ({ page }) => {
  await page.goto('/reader');
  await expect(page).toHaveURL(/\/reader$/);
  await expect(page.locator('#reader')).toBeVisible();
  await expect(page.locator('#reader-chapter-title')).toHaveText('Choose an EPUB to begin.');
});
