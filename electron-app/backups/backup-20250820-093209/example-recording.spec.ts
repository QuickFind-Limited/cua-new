import { test, expect } from '@playwright/test';

test('recorded flow - example', async ({ page }) => {
  // Navigate to the starting URL
  await page.goto('https://example.com');
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Example recorded interactions:
  await page.click('button:has-text("Get started")');
  await page.fill('input[name="email"]', 'user@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  // Verify final state
  await expect(page).toHaveURL(/https:\/\/example\.com\/dashboard/);
});

// Generated on: 2025-08-16T12:00:00.000Z
// Session ID: example-session
// Duration: 30s