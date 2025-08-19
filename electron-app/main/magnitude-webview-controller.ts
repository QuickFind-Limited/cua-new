import { WebContentsView, ipcMain } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// Types for state detection
type PageState = 'login_page' | 'authenticated' | 'unknown';
type StepCategory = 'authentication' | 'main_flow';

interface IntentSpecStep {
  name: string;
  snippet?: string;
  category?: StepCategory;
}

interface CategorizedStep extends IntentSpecStep {
  category: StepCategory;
}

/**
 * Magnitude WebView Controller
 * Controls the existing Electron WebContentsView using Playwright via CDP
 */
export class MagnitudeWebViewController {
  private webView: WebContentsView | null = null;
  private playwrightBrowser: Browser | null = null;
  private playwrightPage: Page | null = null;
  private cdpPort: number = 9333;
  private isConnected = false;

  /**
   * Connect Playwright to existing WebContentsView via CDP
   */
  public async connectToWebView(webView: WebContentsView): Promise<boolean> {
    try {
      this.webView = webView;
      
      // Enable remote debugging on the WebContents
      const webContents = webView.webContents;
      
      // Get the current URL to match the correct page
      const currentUrl = webContents.getURL();
      console.log('Current WebView URL:', currentUrl);

      // Get the WebSocket debugger URL
      const debuggerUrl = await this.getDebuggerUrl(webContents);
      
      if (!debuggerUrl) {
        console.error('Could not get debugger URL from WebContents');
        return false;
      }

      // Connect Playwright via CDP
      console.log('Connecting Playwright to WebContentsView via CDP...');
      this.playwrightBrowser = await chromium.connectOverCDP(debuggerUrl);
      
      // Get the existing context and page
      const contexts = this.playwrightBrowser.contexts();
      console.log(`Found ${contexts.length} browser contexts`);
      
      if (contexts.length > 0) {
        // Find the page that matches our WebView URL
        let foundPage = false;
        for (const context of contexts) {
          const pages = context.pages();
          console.log(`Context has ${pages.length} pages`);
          
          for (const page of pages) {
            const pageUrl = page.url();
            console.log(`Checking page URL: ${pageUrl}`);
            
            // Match the page by URL or use the first available page
            if (pageUrl === currentUrl || pageUrl.includes(currentUrl) || currentUrl.includes(pageUrl)) {
              this.playwrightPage = page;
              console.log('Found matching page:', pageUrl);
              foundPage = true;
              break;
            }
          }
          
          if (foundPage) break;
        }
        
        // If no matching page found, use the first available
        if (!foundPage && contexts[0].pages().length > 0) {
          this.playwrightPage = contexts[0].pages()[0];
          console.log('Using first available page:', await this.playwrightPage.url());
        } else if (!foundPage) {
          // Create a new page if none exist
          this.playwrightPage = await contexts[0].newPage();
          console.log('Created new page in existing context');
        }
      } else {
        console.error('No contexts found in connected browser');
        return false;
      }

      if (!this.playwrightPage) {
        console.error('Could not establish page connection');
        return false;
      }

      this.isConnected = true;
      console.log('Successfully connected Playwright to WebContentsView');
      return true;

    } catch (error) {
      console.error('Failed to connect to WebContentsView:', error);
      // Provide more detailed error information
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      return false;
    }
  }

  /**
   * Get debugger URL from WebContents
   */
  private async getDebuggerUrl(webContents: any): Promise<string | null> {
    try {
      // For Electron apps with remote-debugging-port enabled,
      // we should connect to the main CDP endpoint and find the correct page
      const cdpEndpoint = `http://127.0.0.1:${this.cdpPort}`;
      
      console.log(`Attempting to connect via CDP endpoint: ${cdpEndpoint}`);
      
      // Return the base CDP endpoint - Playwright will discover available pages
      return cdpEndpoint;
    } catch (error) {
      console.error('Failed to get debugger URL:', error);
      return null;
    }
  }

  /**
   * Handle step failure with intelligent analysis
   */
  public async handleStepFailure(
    step: any, 
    error: Error | string, 
    page: Page
  ): Promise<{
    action: 'skip' | 'retry' | 'use_ai' | 'continue';
    skipToStep?: number;
    reason: string;
  }> {
    const errorMessage = error instanceof Error ? error.message : error;
    const currentUrl = page.url();
    
    console.log(`Analyzing failure for step "${step.name}":`, errorMessage);
    console.log('Current page URL:', currentUrl);

    // Check if it's a login/authentication step but user is already logged in
    if (await this.isAuthenticationStep(step) && await this.isUserAuthenticated(page, currentUrl)) {
      return {
        action: 'skip',
        reason: 'User is already authenticated, skipping login step'
      };
    }

    // Check for element not found errors
    if (this.isElementNotFoundError(errorMessage)) {
      return {
        action: 'use_ai',
        reason: 'Element not found, will try with AI assistance to locate alternative selectors'
      };
    }

    // Check for network/loading issues
    if (this.isNetworkOrLoadingError(errorMessage)) {
      return {
        action: 'retry',
        reason: 'Network or page loading issue detected, will retry the step'
      };
    }

    // Check for timeout errors on navigation
    if (this.isTimeoutError(errorMessage) && this.isNavigationStep(step)) {
      return {
        action: 'retry',
        reason: 'Navigation timeout, will retry with longer timeout'
      };
    }

    // Check for page not loaded properly
    if (await this.isPageNotLoaded(page)) {
      return {
        action: 'retry',
        reason: 'Page appears to not be fully loaded, will retry'
      };
    }

    // Default fallback - try AI assistance
    return {
      action: 'use_ai',
      reason: 'Unknown failure reason, will attempt with AI assistance'
    };
  }

  /**
   * Check if step is related to authentication/login
   */
  private async isAuthenticationStep(step: any): Promise<boolean> {
    const stepName = step.name?.toLowerCase() || '';
    const snippet = step.snippet?.toLowerCase() || '';
    
    const authKeywords = ['login', 'signin', 'authenticate', 'password', 'username', 'sign in', 'log in'];
    return authKeywords.some(keyword => 
      stepName.includes(keyword) || snippet.includes(keyword)
    );
  }

  /**
   * Check if user is already authenticated by examining page content and URL
   */
  private async isUserAuthenticated(page: Page, currentUrl: string): Promise<boolean> {
    try {
      // Check URL patterns that indicate authentication
      const authenticatedUrlPatterns = [
        /dashboard/i,
        /profile/i,
        /account/i,
        /home(?!\/|$)/i, // home but not homepage
        /app\//i,
        /user\//i
      ];

      if (authenticatedUrlPatterns.some(pattern => pattern.test(currentUrl))) {
        return true;
      }

      // Check for common authenticated page elements
      const authIndicators = [
        'logout',
        'sign out',
        'profile',
        'dashboard',
        'account settings',
        '[data-testid*="user"]',
        '[data-testid*="profile"]',
        '.user-menu',
        '.profile-dropdown',
        '.logout-btn'
      ];

      for (const indicator of authIndicators) {
        try {
          const element = await page.locator(indicator).first();
          if (await element.isVisible({ timeout: 1000 })) {
            return true;
          }
        } catch {
          // Continue checking other indicators
        }
      }

      return false;
    } catch (error) {
      console.log('Error checking authentication status:', error);
      return false;
    }
  }

  /**
   * Check if error is related to element not found
   */
  private isElementNotFoundError(errorMessage: string): boolean {
    const elementNotFoundKeywords = [
      'element not found',
      'no such element',
      'cannot find element',
      'selector not found',
      'element is not attached',
      'element handle is disposed',
      'locator resolved to',
      'strict mode violation'
    ];

    return elementNotFoundKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Check if error is related to network or loading issues
   */
  private isNetworkOrLoadingError(errorMessage: string): boolean {
    const networkKeywords = [
      'net::',
      'network error',
      'connection refused',
      'connection reset',
      'connection timeout',
      'dns_probe_finished_nxdomain',
      'err_internet_disconnected',
      'err_network_changed',
      'failed to fetch',
      'fetch error'
    ];

    return networkKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Check if error is a timeout error
   */
  private isTimeoutError(errorMessage: string): boolean {
    const timeoutKeywords = [
      'timeout',
      'timed out',
      'time out',
      'exceeded timeout',
      'operation timeout'
    ];

    return timeoutKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Check if step is a navigation step
   */
  private isNavigationStep(step: any): boolean {
    const snippet = step.snippet?.toLowerCase() || '';
    return snippet.includes('goto') || snippet.includes('navigate');
  }

  /**
   * Check if page is not properly loaded
   */
  private async isPageNotLoaded(page: Page): Promise<boolean> {
    try {
      // Check if page is in loading state
      const readyState = await page.evaluate(() => document.readyState);
      if (readyState !== 'complete') {
        return true;
      }

      // Check if page has minimal content (might indicate loading issues)
      const bodyText = await page.locator('body').textContent();
      if (!bodyText || bodyText.trim().length < 10) {
        return true;
      }

      return false;
    } catch (error) {
      console.log('Error checking page load status:', error);
      return true; // Assume not loaded if we can't check
    }
  }

  /**
   * Execute Intent Spec step on the WebView
   */
  public async executeStep(step: any, variables: Record<string, string> = {}): Promise<{
    success: boolean;
    error?: string;
    data?: any;
    failureAction?: {
      action: 'skip' | 'retry' | 'use_ai' | 'continue';
      skipToStep?: number;
      reason: string;
    };
  }> {
    if (!this.isConnected || !this.playwrightPage) {
      return { 
        success: false, 
        error: 'Not connected to WebView. Call connectToWebView first.' 
      };
    }

    try {
      // Replace variables in the snippet
      let snippet = step.snippet || '';
      for (const [key, value] of Object.entries(variables)) {
        snippet = snippet.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      console.log(`Executing step: ${step.name}`);
      console.log(`Snippet: ${snippet}`);

      // Execute the Playwright snippet
      // We need to evaluate it in the context of the page
      const result = await this.evaluateSnippet(snippet);
      
      return { success: true, data: result };

    } catch (error) {
      console.error('Step execution failed:', error);
      
      // Analyze the failure and provide intelligent handling suggestion
      const failureAction = await this.handleStepFailure(step, error, this.playwrightPage!);
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Step execution failed',
        failureAction
      };
    }
  }

  /**
   * Evaluate Playwright snippet
   */
  private async evaluateSnippet(snippet: string): Promise<any> {
    if (!this.playwrightPage) {
      throw new Error('Page not available');
    }

    const page = this.playwrightPage;
    
    // Parse and execute common Playwright commands
    if (snippet.includes('page.goto')) {
      const urlMatch = snippet.match(/page\.goto\(['"]([^'"]+)['"]\)/);
      if (urlMatch) {
        return await page.goto(urlMatch[1]);
      }
    }
    
    if (snippet.includes('page.click')) {
      const selectorMatch = snippet.match(/page\.click\(['"]([^'"]+)['"]\)/);
      if (selectorMatch) {
        return await page.click(selectorMatch[1]);
      }
    }
    
    if (snippet.includes('page.fill')) {
      const match = snippet.match(/page\.fill\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
      if (match) {
        return await page.fill(match[1], match[2]);
      }
    }
    
    if (snippet.includes('page.getByRole')) {
      // Handle modern selectors
      const match = snippet.match(/page\.getByRole\(['"](\w+)['"],\s*{([^}]+)}\)/);
      if (match) {
        const role = match[1];
        const optionsStr = match[2];
        const nameMatch = optionsStr.match(/name:\s*['"]([^'"]+)['"]/);
        
        if (nameMatch) {
          const locator = page.getByRole(role as any, { name: nameMatch[1] });
          
          // Check what action to perform
          if (snippet.includes('.click()')) {
            return await locator.click();
          } else if (snippet.includes('.fill(')) {
            const valueMatch = snippet.match(/\.fill\(['"]([^'"]+)['"]\)/);
            if (valueMatch) {
              return await locator.fill(valueMatch[1]);
            }
          }
        }
      }
    }
    
    if (snippet.includes('page.waitForSelector')) {
      const match = snippet.match(/page\.waitForSelector\(['"]([^'"]+)['"]/);
      if (match) {
        return await page.waitForSelector(match[1]);
      }
    }
    
    // For other commands, try to evaluate directly
    // This is less safe but allows for more flexibility
    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const func = new AsyncFunction('page', snippet);
      return await func(page);
    } catch (error) {
      console.error('Failed to evaluate snippet:', error);
      throw error;
    }
  }

  /**
   * Execute complete Intent Spec flow with intelligent behavior
   */
  public async executeFlow(
    intentSpec: any, 
    variables: Record<string, string> = {}
  ): Promise<{
    success: boolean;
    results: any[];
    errors: string[];
  }> {
    const results: any[] = [];
    const errors: string[] = [];
    
    if (!this.isConnected || !this.playwrightPage) {
      return { 
        success: false, 
        results: [], 
        errors: ['Not connected to WebView'] 
      };
    }

    console.log(`Executing flow: ${intentSpec.name}`);
    
    // Navigate to start URL if specified
    if (intentSpec.url && this.playwrightPage) {
      try {
        console.log(`Navigating to: ${intentSpec.url}`);
        await this.playwrightPage.goto(intentSpec.url);
        results.push({ step: 'navigation', success: true });
      } catch (error) {
        errors.push(`Navigation failed: ${error}`);
        console.error('Navigation failed:', error);
      }
    }

    // 1. Check initial page state before starting execution
    console.log('Detecting initial page state...');
    const initialPageState = await this.detectPageState(this.playwrightPage);
    console.log(`Initial page state: ${initialPageState}`);
    results.push({ 
      step: 'initial_page_state_detection', 
      success: true, 
      data: { pageState: initialPageState }
    });

    // 2. Categorize steps using categorizeSteps()
    const steps = intentSpec.steps || [];
    const categorizedSteps = this.categorizeSteps(steps);
    console.log('Steps categorized:');
    categorizedSteps.forEach((step, idx) => {
      console.log(`  ${idx}: ${step.name} (${step.category})`);
    });
    results.push({ 
      step: 'steps_categorization', 
      success: true, 
      data: { 
        totalSteps: categorizedSteps.length,
        authSteps: categorizedSteps.filter(s => s.category === 'authentication').length,
        mainFlowSteps: categorizedSteps.filter(s => s.category === 'main_flow').length
      }
    });

    // 3. If already authenticated, skip authentication steps
    let startIndex = 0;
    if (initialPageState === 'authenticated') {
      startIndex = this.findFirstMainFlowStep(categorizedSteps);
      console.log(`Already authenticated - jumping to first main flow step at index ${startIndex}`);
      results.push({
        step: 'authentication_skip',
        success: true,
        data: { 
          reason: 'Already authenticated', 
          skippedToIndex: startIndex,
          skippedSteps: categorizedSteps.slice(0, startIndex).map(s => s.name)
        }
      });
    }

    // Execute steps starting from determined index with intelligent failure handling
    let currentStepIndex = startIndex;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (currentStepIndex < categorizedSteps.length) {
      const step = categorizedSteps[currentStepIndex];
      console.log(`\nExecuting step ${currentStepIndex}: ${step.name} (${step.category})`);
      console.log(`Retry count: ${retryCount}/${maxRetries}`);
      
      try {
        // 4. Wrap executeStep in try-catch
        const stepResult = await this.executeStep(step, variables);
        
        if (stepResult.success) {
          console.log(`Step ${currentStepIndex} succeeded: ${step.name}`);
          results.push({
            step: step.name,
            success: true,
            error: undefined,
            data: stepResult.data,
            retryCount,
            category: step.category
          });
          
          // Reset retry count and move to next step
          retryCount = 0;
          currentStepIndex++;
        } else {
          throw new Error(stepResult.error || 'Step execution failed');
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Step ${currentStepIndex} failed: ${errorMessage}`);
        
        // 5. On failure, call handleStepFailure() and act on its decision
        const failureAnalysis = await this.handleStepFailure(step, error, this.playwrightPage);
        console.log(`Failure analysis for step ${currentStepIndex}:`, failureAnalysis);
        
        // 6. Log all decisions for debugging
        results.push({
          step: `${step.name}_failure_analysis`,
          success: true,
          data: {
            error: errorMessage,
            failureAnalysis,
            stepIndex: currentStepIndex,
            retryCount,
            category: step.category
          }
        });
        
        // Act on the failure analysis decision
        switch (failureAnalysis.action) {
          case 'skip':
            console.log(`Skipping step ${currentStepIndex}: ${failureAnalysis.reason}`);
            results.push({
              step: step.name,
              success: false,
              error: errorMessage,
              skipped: true,
              skipReason: failureAnalysis.reason,
              retryCount,
              category: step.category
            });
            
            if (failureAnalysis.skipToStep !== undefined) {
              currentStepIndex = failureAnalysis.skipToStep;
            } else {
              currentStepIndex++;
            }
            retryCount = 0;
            break;
            
          case 'retry':
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`Retrying step ${currentStepIndex} (attempt ${retryCount}/${maxRetries}): ${failureAnalysis.reason}`);
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
              // Don't increment currentStepIndex, retry the same step
            } else {
              console.log(`Max retries exceeded for step ${currentStepIndex}, marking as failed`);
              results.push({
                step: step.name,
                success: false,
                error: `Max retries exceeded: ${errorMessage}`,
                retryCount,
                category: step.category
              });
              errors.push(`Step "${step.name}" failed after ${maxRetries} retries: ${errorMessage}`);
              
              // Check if we should continue on failure
              if (step.continueOnFailure === true) {
                currentStepIndex++;
                retryCount = 0;
              } else {
                console.log(`Breaking execution due to max retries exceeded for critical step: ${step.name}`);
                break;
              }
            }
            break;
            
          case 'use_ai':
            console.log(`Marking step ${currentStepIndex} for AI assistance: ${failureAnalysis.reason}`);
            results.push({
              step: step.name,
              success: false,
              error: errorMessage,
              needsAI: true,
              aiReason: failureAnalysis.reason,
              retryCount,
              category: step.category
            });
            currentStepIndex++;
            retryCount = 0;
            break;
            
          case 'continue':
            console.log(`Continuing despite failure for step ${currentStepIndex}: ${failureAnalysis.reason}`);
            results.push({
              step: step.name,
              success: false,
              error: errorMessage,
              continued: true,
              continueReason: failureAnalysis.reason,
              retryCount,
              category: step.category
            });
            currentStepIndex++;
            retryCount = 0;
            break;
            
          default:
            // Unknown action, treat as error
            console.error(`Unknown failure action: ${failureAnalysis.action}`);
            results.push({
              step: step.name,
              success: false,
              error: errorMessage,
              unknownAction: failureAnalysis.action,
              retryCount,
              category: step.category
            });
            errors.push(`Step "${step.name}" failed with unknown recovery action: ${errorMessage}`);
            
            if (step.continueOnFailure !== true) {
              console.log(`Breaking execution due to unknown failure action for step: ${step.name}`);
              break;
            }
            currentStepIndex++;
            retryCount = 0;
        }
      }
      
      // Add a small delay between steps to avoid overwhelming the page
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const finalSuccess = errors.length === 0;
    console.log(`\nFlow execution completed:`);
    console.log(`  Success: ${finalSuccess}`);
    console.log(`  Errors: ${errors.length}`);
    console.log(`  Total steps processed: ${results.filter(r => !r.step.includes('_analysis') && !r.step.includes('_detection') && !r.step.includes('_categorization') && !r.step.includes('_skip')).length}`);
    
    if (errors.length > 0) {
      console.log(`  Error details:`);
      errors.forEach((error, idx) => console.log(`    ${idx + 1}. ${error}`));
    }

    return {
      success: finalSuccess,
      results,
      errors
    };
  }

  /**
   * Detect the current state of a page
   */
  public async detectPageState(page: Page): Promise<PageState> {
    try {
      const content = await page.content();
      const url = page.url();

      console.log(`Analyzing page state for URL: ${url}`);

      // Check for login indicators
      const loginIndicators = [
        'input[type="email"]',
        'input[type="password"]',
        'input[name*="email"]',
        'input[name*="password"]',
        'input[name*="username"]',
        'button[type="submit"]:has-text("sign in")',
        'button[type="submit"]:has-text("login")',
        'button[type="submit"]:has-text("log in")',
        'a:has-text("sign in")',
        'a:has-text("login")',
        'a:has-text("log in")',
        '.login-form',
        '.signin-form',
        '#login',
        '#signin'
      ];

      // Check for authenticated indicators
      const authenticatedIndicators = [
        'button:has-text("logout")',
        'button:has-text("sign out")',
        'a:has-text("logout")',
        'a:has-text("sign out")',
        'nav',
        '.navbar',
        '.navigation',
        '.dashboard',
        '.user-menu',
        '.profile-menu',
        '[data-testid*="dashboard"]',
        '[data-testid*="navigation"]'
      ];

      // Check for login indicators first
      let hasLoginIndicators = false;
      for (const selector of loginIndicators) {
        try {
          const element = await page.locator(selector).first();
          if (await element.count() > 0) {
            hasLoginIndicators = true;
            console.log(`Found login indicator: ${selector}`);
            break;
          }
        } catch (error) {
          // Continue checking other selectors
        }
      }

      // Check for authenticated indicators
      let hasAuthenticatedIndicators = false;
      for (const selector of authenticatedIndicators) {
        try {
          const element = await page.locator(selector).first();
          if (await element.count() > 0) {
            hasAuthenticatedIndicators = true;
            console.log(`Found authenticated indicator: ${selector}`);
            break;
          }
        } catch (error) {
          // Continue checking other selectors
        }
      }

      // Determine page state based on indicators
      if (hasLoginIndicators && !hasAuthenticatedIndicators) {
        return 'login_page';
      } else if (hasAuthenticatedIndicators && !hasLoginIndicators) {
        return 'authenticated';
      } else {
        // Check content for additional clues
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('sign in') || lowerContent.includes('login') || lowerContent.includes('password')) {
          return 'login_page';
        } else if (lowerContent.includes('dashboard') || lowerContent.includes('logout') || lowerContent.includes('profile')) {
          return 'authenticated';
        }
        return 'unknown';
      }

    } catch (error) {
      console.error('Error detecting page state:', error);
      return 'unknown';
    }
  }

  /**
   * Categorize Intent Spec steps based on their content
   */
  public categorizeSteps(steps: IntentSpecStep[]): CategorizedStep[] {
    return steps.map(step => {
      const stepName = step.name.toLowerCase();
      const snippet = (step.snippet || '').toLowerCase();
      
      // Check for authentication-related keywords
      const authenticationKeywords = ['login', 'password', 'sign in', 'email', 'signin', 'username', 'authenticate'];
      
      const isAuthentication = authenticationKeywords.some(keyword => 
        stepName.includes(keyword) || snippet.includes(keyword)
      );

      return {
        ...step,
        category: isAuthentication ? 'authentication' : 'main_flow'
      };
    });
  }

  /**
   * Find the index of the first main flow step in categorized steps
   */
  public findFirstMainFlowStep(categorizedSteps: CategorizedStep[]): number {
    const firstMainFlowIndex = categorizedSteps.findIndex(step => step.category === 'main_flow');
    return firstMainFlowIndex === -1 ? 0 : firstMainFlowIndex;
  }

  /**
   * Disconnect from WebView
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.playwrightBrowser) {
        await this.playwrightBrowser.close();
      }
      
      if (this.webView?.webContents.debugger.isAttached()) {
        this.webView.webContents.debugger.detach();
      }
    } catch (error) {
      console.error('Error during disconnect:', error);
    } finally {
      this.playwrightBrowser = null;
      this.playwrightPage = null;
      this.webView = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if connected
   */
  public getIsConnected(): boolean {
    return this.isConnected;
  }
}