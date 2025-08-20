import { Page, expect } from '@playwright/test';

/**
 * Deterministic Playwright snippet without variables
 * Simple navigation snippet with fixed values
 */

/**
 * Performs a simple navigation and interaction flow with fixed values
 * @param page - Playwright page object
 * @returns Promise<boolean> - Success status of the operation
 */
export async function simpleNavigationFlow(page: Page): Promise<boolean> {
  try {
    console.log('Starting simple navigation flow...');

    // Navigate to a specific page
    console.log('Navigating to example.com');
    await page.goto('https://example.com', { waitUntil: 'networkidle' });

    // Wait for page to load and verify title
    await page.waitForLoadState('domcontentloaded');
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Assert that we're on the correct page
    await expect(page).toHaveTitle(/Example Domain/);

    // Look for and click on a specific element
    const moreInfoLink = page.locator('a[href*="iana.org"]');
    if (await moreInfoLink.isVisible()) {
      console.log('Clicking "More information..." link');
      await moreInfoLink.click();
      
      // Wait for navigation
      await page.waitForLoadState('networkidle');
      
      // Verify we navigated to the correct page
      const currentUrl = page.url();
      console.log(`Current URL: ${currentUrl}`);
      
      if (currentUrl.includes('iana.org')) {
        console.log('Successfully navigated to IANA website');
        
        // Perform additional verification
        await expect(page).toHaveURL(/iana\.org/);
        
        return true;
      }
    }

    // If the link wasn't found, try alternative approach
    console.log('More info link not found, checking page content');
    
    // Check for specific text content
    const pageContent = await page.textContent('body');
    if (pageContent && pageContent.includes('Example Domain')) {
      console.log('Page contains expected content');
      
      // Take a screenshot for verification
      await page.screenshot({ 
        path: `example-page-${Date.now()}.png`,
        fullPage: true 
      });
      
      return true;
    }

    console.error('Expected content not found on page');
    return false;

  } catch (error) {
    console.error(`Navigation flow failed: ${error.message}`);
    
    // Take screenshot for debugging
    try {
      await page.screenshot({ 
        path: `navigation-error-${Date.now()}.png`,
        fullPage: true 
      });
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError.message);
    }

    return false;
  }
}

/**
 * Performs a simple form interaction with fixed values
 * @param page - Playwright page object
 * @returns Promise<boolean> - Success status of the operation
 */
export async function simpleFormInteraction(page: Page): Promise<boolean> {
  try {
    console.log('Starting simple form interaction...');

    // Navigate to a form page (example)
    await page.goto('https://httpbin.org/forms/post', { waitUntil: 'networkidle' });

    // Fill out form fields with fixed values
    console.log('Filling form fields');
    await page.fill('input[name="custname"]', 'John Doe');
    await page.fill('input[name="custtel"]', '555-1234');
    await page.fill('input[name="custemail"]', 'john.doe@example.com');

    // Select from dropdown
    await page.selectOption('select[name="size"]', 'large');

    // Check radio button
    await page.check('input[name="topping"][value="bacon"]');

    // Click submit button
    console.log('Submitting form');
    await page.click('input[type="submit"]');

    // Wait for response and verify
    await page.waitForLoadState('networkidle');
    
    // Check if form was submitted successfully
    const responseText = await page.textContent('body');
    if (responseText && responseText.includes('John Doe')) {
      console.log('Form submitted successfully');
      
      // Additional assertions
      await expect(page.locator('body')).toContainText('john.doe@example.com');
      await expect(page.locator('body')).toContainText('large');
      
      return true;
    }

    console.error('Form submission verification failed');
    return false;

  } catch (error) {
    console.error(`Form interaction failed: ${error.message}`);
    
    // Take screenshot for debugging
    try {
      await page.screenshot({ 
        path: `form-error-${Date.now()}.png`,
        fullPage: true 
      });
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError.message);
    }

    return false;
  }
}

/**
 * Main execution function that runs both simple flows
 * @param page - Playwright page object
 */
export async function executeSimpleFlows(page: Page): Promise<void> {
  console.log('Executing deterministic flows without variables...');

  // Run navigation flow
  const navigationSuccess = await simpleNavigationFlow(page);
  if (!navigationSuccess) {
    throw new Error('Navigation flow failed');
  }

  // Run form interaction flow
  const formSuccess = await simpleFormInteraction(page);
  if (!formSuccess) {
    throw new Error('Form interaction flow failed');
  }

  console.log('All simple flows completed successfully');
}