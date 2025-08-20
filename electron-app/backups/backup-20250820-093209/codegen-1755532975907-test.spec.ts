import { test, expect } from '@playwright/test';

test('Chromium Native Tabs Recording - codegen-1755532975907', async ({ context, page }) => {
  // Recording with 1 tabs
  // Total actions: 3
  
  // Navigate to starting URL
  await page.goto('https://www.google.com/');
  
  // Recorded actions
  await page.goto('https://www.google.com/');
  await page.goto('https://www.google.com/');
  await page.click('header#gb'); // GmailImagesSign in

  
  // Verify final states
  // page: Google
});

/*
 * Recording Session: codegen-1755532975907
 * Duration: 123s
 * Tabs Used: 1
 * 
 * Instructions to replay:
 * npx playwright test codegen-1755532975907-test.spec.ts
 * 
 * View trace:
 * npx playwright show-trace recordings/codegen-1755532975907-trace.zip
 */
