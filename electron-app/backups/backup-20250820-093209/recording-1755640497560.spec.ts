import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.google.com/');
  await page.getByRole('combobox', { name: 'Search' }).click();
  await page.getByText('fantasy football names').click();
  await page.locator('iframe[name="a-fhzq798iggv1"]').contentFrame().getByRole('checkbox', { name: 'I\'m not a robot' }).click();
});