import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.google.com/');
  await page.getByRole('button', { name: 'I\'m Feeling Lucky' }).click();
  await page.getByRole('link', { name: 'Store' }).click();
  await page.locator('[data-test="nav-links"]').getByRole('link', { name: 'Support' }).click();
});