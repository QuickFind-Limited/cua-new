import { test, expect } from '@playwright/test';

test.use({
  viewport: {
    height: 800,
    width: 1280
  }
});

test('test', async ({ page }) => {
  await page.goto('https://www.google.com/');
});