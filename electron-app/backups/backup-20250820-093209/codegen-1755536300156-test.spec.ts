import { test, expect } from '@playwright/test';

test.use({
  viewport: {
    height: 800,
    width: 1280
  }
});

test('test', async ({ page }) => {
  await page.goto('https://www.google.com/');
  await page.getByRole('button', { name: 'Stay signed out' }).click();
  await page.goto('https://accounts.zoho.com/signin?servicename=ZohoInventory&signupurl=https://www.zoho.com/us/inventory/signup/index.html');
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).click();
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).fill('shane@quickfindai.com');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('textbox', { name: 'Enter password' }).fill('#QuickFind2024');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Reports' }).click();
  await page.getByRole('link', { name: 'Inventory Summary' }).click();
});