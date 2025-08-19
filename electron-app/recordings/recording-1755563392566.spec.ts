import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://accounts.zoho.com/signin?servicename=ZohoInventory&signupurl=https://www.zoho.com/us/inventory/signup/index.html');
  await page.getByText('STEP 1 OF 2 Sign in to access Inventory Signed-in accounts Sign in to another').click();
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).fill('ah');
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).press('CapsLock');
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).fill('');
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).press('CapsLock');
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).fill('shane@quickfindai.com');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('textbox', { name: 'Enter password' }).fill('#QuickFind2024');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'I Understand' }).click();
  await page.getByRole('link', { name: 'Reports' }).click();
  await page.getByRole('link', { name: 'Inventory Summary' }).click();
});