import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.google.com/');
  await page.getByRole('link', { name: 'Store' }).click();
  await page.getByRole('link', { name: 'Accessories' }).click();
  await page.getByRole('link', { name: 'Pixel Buds Pro 2 Pixel Buds' }).click();
  await page.locator('[data-test="price-and-cta"] [data-test="cta"]').click();
  await page.getByRole('button', { name: 'Hazel' }).click();
  await page.getByRole('button', { name: 'Add Pixel Buds Pro 2 to cart' }).click();
  await page.locator('[data-test="header-cart"]').click();
});