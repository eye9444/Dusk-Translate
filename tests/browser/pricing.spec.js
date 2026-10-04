import { test, expect } from '@playwright/test';

test('pricing route renders Paddle-backed tiers and switches billing periods', async ({ page }) => {
  await page.goto('/pricing');

  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.locator('#pricing')).toBeVisible();
  const pricing = page.locator('#pricing');
  await expect(pricing.locator('.pricing-card')).toHaveCount(2);
  await pricing.getByRole('button', { name: 'Teams', exact: true }).click();
  await expect(pricing.locator('[data-tier="Teams"]')).toBeVisible();
  await expect(pricing.locator('[data-tier="Pro"]')).toBeHidden();
  await expect(pricing.locator('[data-period-for="Teams"]')).toHaveText('per month');
  await expect(pricing.locator('[data-price-for="Pro"]')).not.toHaveText('Price unavailable');
  await expect(pricing.getByRole('button', { name: 'Yearly', exact: true })).toBeVisible();

  await pricing.getByRole('button', { name: 'Yearly', exact: true }).click();
  await expect(pricing.getByRole('button', { name: 'Yearly', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(pricing.locator('[data-period-for="Teams"]')).toHaveText('per year');
});

test('subscription welcome route is available without a signed-in session', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.locator('#subscription-welcome')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open your library/ })).toHaveAttribute('href', '/home');
});
