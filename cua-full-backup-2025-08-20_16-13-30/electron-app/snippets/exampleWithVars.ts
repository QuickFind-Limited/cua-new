import { Page, expect } from '@playwright/test';

/**
 * Deterministic Playwright snippet with variables
 * Implements a login flow with parameterized values
 */

interface LoginCredentials {
  username: string;
  password: string;
  loginUrl: string;
}

interface LoginSelectors {
  usernameField: string;
  passwordField: string;
  loginButton: string;
  successIndicator: string;
}

/**
 * Performs a deterministic login flow with the provided credentials
 * @param page - Playwright page object
 * @param credentials - User credentials and URL
 * @param selectors - CSS selectors for form elements
 * @returns Promise<boolean> - Success status of login
 */
export async function loginWithVariables(
  page: Page,
  credentials: LoginCredentials,
  selectors: LoginSelectors
): Promise<boolean> {
  try {
    // Navigate to login page
    console.log(`Navigating to: ${credentials.loginUrl}`);
    await page.goto(credentials.loginUrl, { waitUntil: 'networkidle' });

    // Wait for login form to be visible
    await page.waitForSelector(selectors.usernameField, { timeout: 10000 });

    // Fill username field
    console.log(`Filling username: ${credentials.username}`);
    await page.fill(selectors.usernameField, credentials.username);

    // Fill password field
    console.log('Filling password');
    await page.fill(selectors.passwordField, credentials.password);

    // Click login button
    console.log('Clicking login button');
    await page.click(selectors.loginButton);

    // Wait for navigation or success indicator
    await page.waitForSelector(selectors.successIndicator, { timeout: 15000 });

    // Verify successful login
    const successElement = await page.$(selectors.successIndicator);
    const isLoggedIn = successElement !== null;

    if (isLoggedIn) {
      console.log('Login successful');
      return true;
    } else {
      console.error('Login failed - success indicator not found');
      return false;
    }

  } catch (error) {
    console.error(`Login failed with error: ${error.message}`);
    
    // Take screenshot for debugging
    try {
      await page.screenshot({ 
        path: `login-error-${Date.now()}.png`,
        fullPage: true 
      });
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError.message);
    }

    return false;
  }
}

/**
 * Example usage of the login function
 */
export async function exampleUsage(page: Page): Promise<void> {
  const credentials: LoginCredentials = {
    username: 'test@example.com',
    password: 'securePassword123',
    loginUrl: 'https://example.com/login'
  };

  const selectors: LoginSelectors = {
    usernameField: '#username',
    passwordField: '#password',
    loginButton: 'button[type="submit"]',
    successIndicator: '.dashboard, .welcome-message, [data-testid="dashboard"]'
  };

  const loginSuccess = await loginWithVariables(page, credentials, selectors);
  
  if (loginSuccess) {
    console.log('Proceeding with authenticated actions...');
    // Additional actions can be performed here
  } else {
    throw new Error('Login failed - cannot proceed with authenticated actions');
  }
}