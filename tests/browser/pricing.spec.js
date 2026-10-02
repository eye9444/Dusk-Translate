import { test, expect } from '@playwright/test';

test('pricing route renders Paddle-backed tiers and switches billing periods', async ({ page }) => {
  await page.goto('/pricing');

  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.locator('#pricing')).toBeVisible();
  await expect(page.locator('.pricing-card')).toHaveCount(3);
  await expect(page.locator('[data-period-for="Advanced"]')).toHaveText('per month');
  await expect(page.locator('[data-price-for="Pro"]')).not.toHaveText('Price unavailable');
  await expect(page.getByRole('button', { name: 'Yearly', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Yearly', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yearly', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-period-for="Advanced"]')).toHaveText('per year');
});

test('subscription welcome route is available without a signed-in session', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.locator('#subscription-welcome')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open your library/ })).toHaveAttribute('href', '/home');
});
