import { WebContentsView, ipcMain } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// Generic types for workflow state detection and step execution
type WorkflowState = string; // Generic state - can be any string value like 'initial', 'logged_in', 'configured', 'completed', etc.
type StepCategory = string; // Generic category - can be any string like 'setup', 'auth', 'main', 'cleanup', etc.

// Generic page state detection interfaces
interface PageDetectionRule {
  /** Unique name for this rule */
  name: string;
  /** Description of what this rule detects */
  description?: string;
  /** CSS selectors that should be present on the page */
  selectors?: string[];
  /** URL patterns that should match (as regex patterns) */
  urlPatterns?: string[];
  /** Content patterns that should be found in page text (as regex patterns) */
  contentPatterns?: string[];
  /** Minimum number of selector matches required (default: 1) */
  requiredCount?: number;
  /** Selectors that should NOT be present on the page */
  excludeSelectors?: string[];
  /** Weight for this rule when calculating confidence (default: 1.0) */
  weight?: number;
}

interface PageDetectionRuleSet {
  /** Name of this rule set */
  name: string;
  /** Description of what these rules detect */
  description?: string;
  /** Rules to evaluate for this state */
  rules: PageDetectionRule[];
  /** State name to return if rules match */
  stateName: string;
  /** Minimum confidence threshold to consider this state (0-1, default: 0.5) */
  minimumConfidence?: number;
}

interface PageStateDetectionResult {
  /** Detected state name */
  state: string;
  /** Confidence score for this detection (0-1) */
  confidence: number;
  /** URL that was analyzed */
  url: string;
  /** Details about which rules matched */
  matchedRules: {
    ruleName: string;
    ruleDescription?: string;
    matchedSelectors: { selector: string; count: number }[];
    matchedUrlPatterns: string[];
    matchedContentPatterns: string[];
    excludedSelectors: string[];
    weight: number;
  }[];
  /** All detected elements for debugging */
  detectedElements: {
    selector: string;
    count: number;
  }[];
  /** Analysis metadata */
  metadata: {
    totalRulesEvaluated: number;
    evaluationTimeMs: number;
    contentLength: number;
  };
}

interface WorkflowCondition {
  /** State that must be present for this condition to apply */
  requiredState?: WorkflowState;
  /** States that must NOT be present for this condition to apply */
  excludedStates?: WorkflowState[];
  /** URL patterns that must match for this condition to apply */
  urlPatterns?: RegExp[];
  /** Custom evaluation function for complex conditions */
  customEvaluator?: (page: any, currentState: WorkflowState) => Promise<boolean>;
}

interface CategorizationRule {
  /** Name/identifier for this rule */
  name: string;
  /** Category to assign if this rule matches */
  category: StepCategory;
  /** Priority of this rule (higher numbers = higher priority) */
  priority?: number;
  /** Keywords to match in step name or snippet */
  keywords?: string[];
  /** Regex patterns to match against step content */
  patterns?: RegExp[];
  /** Step metadata keys to check */
  metadataKeys?: string[];
  /** Custom evaluation function */
  evaluator?: (step: IntentSpecStep) => boolean;
  /** Conditions that must be met for this rule to apply */
  conditions?: WorkflowCondition[];
}

interface IntentSpecStep {
  name: string;
  snippet?: string;
  category?: StepCategory;
  continueOnFailure?: boolean;
  /** Conditions under which this step should be skipped */
  skipConditions?: WorkflowCondition[];
  /** Conditions that must be met for this step to execute */
  executeConditions?: WorkflowCondition[];
  /** State that this step should transition to upon successful completion */
  targetState?: WorkflowState;
  /** Custom metadata for categorization and other purposes */
  metadata?: Record<string, any>;
  /** Prerequisites that must be completed before this step */
  prerequisites?: string[];
}

interface CategorizedStep extends IntentSpecStep {
  category: StepCategory;
}

// Extended interface for Intent Specs that support custom page detection
interface IntentSpecWithDetection extends IntentSpecStep {
  /** Custom page state detection rules for this Intent Spec */
  pageDetectionRuleSets?: PageDetectionRuleSet[];
  /** Default detection rules to use if no custom rules are provided */
  defaultDetectionRuleSets?: string[]; // Names of built-in rule sets to use
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
    
    // 1. Detect initial page state using custom or default detection rules
    console.log('Detecting initial page state before navigation...');
    const detectionRuleSets = intentSpec.detectionRules || this.getBuiltInDetectionRuleSets();
    const preNavigationResult = await this.detectPageStateDetailed(this.playwrightPage, detectionRuleSets);
    const currentUrl = this.playwrightPage.url();
    console.log(`Pre-navigation state: ${preNavigationResult.state} (confidence: ${preNavigationResult.confidence}) at URL: ${currentUrl}`);
    
    // 2. Categorize steps using the new generic categorization system
    const steps = intentSpec.steps || [];
    const categorizedSteps = this.categorizeSteps(steps, {
      rules: intentSpec.categorizationRules,
      categoryMappings: intentSpec.categoryMappings,
      defaultCategory: intentSpec.defaultCategory || 'workflow_step',
      validatePrerequisites: intentSpec.validatePrerequisites
    });
    console.log('Steps categorized:');
    categorizedSteps.forEach((step, idx) => {
      console.log(`  ${idx}: ${step.name} (${step.category})`);
    });
    
    // 3. Evaluate skip conditions based on current state and step conditions
    let skipNavigation = false;
    let startIndex = 0;
    
    // Check each step's skip conditions
    for (let i = 0; i < categorizedSteps.length; i++) {
      const step = categorizedSteps[i];
      
      // Check if this step should be skipped based on current state
      if (await this.shouldSkipStep(step, preNavigationResult.state, this.playwrightPage)) {
        console.log(`Step ${i} "${step.name}" should be skipped based on current state`);
        continue;
      }
      
      // Found the first step that shouldn't be skipped
      startIndex = i;
      break;
    }
    
    // Determine if we should skip navigation based on state and URL
    if (intentSpec.url) {
      const targetUrl = new URL(intentSpec.url);
      const currentDomain = new URL(currentUrl).hostname;
      const targetDomain = targetUrl.hostname;
      
      // Skip navigation if we're already on the target domain in the right state
      if (intentSpec.skipNavigationStates?.includes(preNavigationResult.state)) {
        if (currentDomain === targetDomain || currentDomain.includes(targetDomain.replace('accounts.', '')) || targetDomain.includes('accounts.') && currentDomain.includes(targetDomain.split('.').slice(1).join('.'))) {
          skipNavigation = true;
          console.log(`Skipping navigation - already in state "${preNavigationResult.state}" on target domain`);
          results.push({
            step: 'skip_navigation',
            success: true,
            data: { 
              reason: `Already in required state: ${preNavigationResult.state}`, 
              currentUrl,
              targetUrl: intentSpec.url,
              skippedToIndex: startIndex,
              stateConfidence: preNavigationResult.confidence
            }
          });
        }
      }
    }
    
    // Navigate to start URL if needed
    if (!skipNavigation && intentSpec.url && this.playwrightPage) {
      try {
        console.log(`Navigating to: ${intentSpec.url}`);
        await this.playwrightPage.goto(intentSpec.url);
        results.push({ step: 'navigation', success: true });
      } catch (error) {
        errors.push(`Navigation failed: ${error}`);
        console.error('Navigation failed:', error);
      }
    }

    // Check page state after navigation (if we navigated)
    console.log('Detecting page state after navigation/decision...');
    const postNavigationResult = await this.detectPageStateDetailed(this.playwrightPage, detectionRuleSets);
    console.log(`Current page state: ${postNavigationResult.state} (confidence: ${postNavigationResult.confidence})`);
    results.push({ 
      step: 'page_state_detection', 
      success: true, 
      data: { 
        state: postNavigationResult.state,
        confidence: postNavigationResult.confidence,
        url: postNavigationResult.url,
        matchedRules: postNavigationResult.matchedRules.length
      }
    });
    
    // Log categorization summary
    const categorySummary: Record<string, number> = {};
    categorizedSteps.forEach(step => {
      categorySummary[step.category] = (categorySummary[step.category] || 0) + 1;
    });
    
    results.push({ 
      step: 'steps_categorization', 
      success: true, 
      data: { 
        totalSteps: categorizedSteps.length,
        categorySummary,
        startIndex
      }
    });

    // Re-evaluate skip conditions after navigation if state changed
    if (!skipNavigation && postNavigationResult.state !== preNavigationResult.state) {
      // State changed after navigation, re-evaluate which steps to skip
      for (let i = startIndex; i < categorizedSteps.length; i++) {
        const step = categorizedSteps[i];
        
        if (await this.shouldSkipStep(step, postNavigationResult.state, this.playwrightPage)) {
          console.log(`Step ${i} "${step.name}" should be skipped based on post-navigation state`);
          continue;
        }
        
        // Found the first step that shouldn't be skipped
        if (i !== startIndex) {
          const previousStartIndex = startIndex;
          startIndex = i;
          console.log(`Adjusted start index from ${previousStartIndex} to ${startIndex} based on state: ${postNavigationResult.state}`);
          results.push({
            step: 'skip_adjustment_post_navigation',
            success: true,
            data: { 
              reason: `State changed to: ${postNavigationResult.state}`, 
              previousStartIndex,
              newStartIndex: startIndex,
              skippedSteps: categorizedSteps.slice(previousStartIndex, startIndex).map(s => s.name)
            }
          });
        }
        break;
      }
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
   * Get built-in page detection rule sets (internal helper)
   */
  private getBuiltInDetectionRuleSetsAsRecord(): Record<string, PageDetectionRuleSet> {
    return {
      'authentication': {
        name: 'authentication',
        description: 'Detect authentication-related page states',
        stateName: 'login_page',
        minimumConfidence: 0.6,
        rules: [
          {
            name: 'login_form_elements',
            description: 'Login form input elements',
            selectors: [
              'input[type="email"]',
              'input[type="password"]',
              'input[name*="email"]',
              'input[name*="password"]',
              'input[name*="username"]'
            ],
            weight: 2.0
          },
          {
            name: 'login_buttons',
            description: 'Login action buttons',
            selectors: [
              'button[type="submit"]:has-text("sign in")',
              'button[type="submit"]:has-text("login")',
              'button[type="submit"]:has-text("log in")',
              'a:has-text("sign in")',
              'a:has-text("login")',
              'a:has-text("log in")'
            ],
            weight: 1.5
          },
          {
            name: 'login_containers',
            description: 'Login form containers',
            selectors: ['.login-form', '.signin-form', '#login', '#signin'],
            weight: 1.0
          },
          {
            name: 'login_content',
            description: 'Login-related text content',
            contentPatterns: [
              'sign\\s+in',
              'log\\s*in',
              'password',
              'enter\\s+your\\s+credentials'
            ],
            weight: 0.5
          }
        ]
      },
      'authenticated': {
        name: 'authenticated',
        description: 'Detect authenticated/logged-in states',
        stateName: 'authenticated',
        minimumConfidence: 0.6,
        rules: [
          {
            name: 'logout_elements',
            description: 'Logout buttons and links',
            selectors: [
              'button:has-text("logout")',
              'button:has-text("sign out")',
              'a:has-text("logout")',
              'a:has-text("sign out")'
            ],
            weight: 2.0
          },
          {
            name: 'navigation_elements',
            description: 'Main navigation elements',
            selectors: [
              'nav',
              '.navbar',
              '.navigation',
              '.user-menu',
              '.profile-menu'
            ],
            weight: 1.0
          },
          {
            name: 'authenticated_containers',
            description: 'Authenticated page containers',
            selectors: [
              '.dashboard',
              '[data-testid*="dashboard"]',
              '[data-testid*="navigation"]'
            ],
            weight: 1.5
          },
          {
            name: 'authenticated_content',
            description: 'Authenticated state text content',
            contentPatterns: [
              'dashboard',
              'welcome\\s+back',
              'my\\s+account',
              'profile'
            ],
            weight: 0.5
          }
        ]
      }
    };
  }

  /**
   * Evaluate a single detection rule against a page
   */
  private async evaluateDetectionRule(
    page: Page, 
    rule: PageDetectionRule, 
    content: string, 
    url: string
  ): Promise<{
    matched: boolean;
    confidence: number;
    matchedSelectors: { selector: string; count: number }[];
    matchedUrlPatterns: string[];
    matchedContentPatterns: string[];
    excludedSelectors: string[];
  }> {
    const result = {
      matched: false,
      confidence: 0,
      matchedSelectors: [] as { selector: string; count: number }[],
      matchedUrlPatterns: [] as string[],
      matchedContentPatterns: [] as string[],
      excludedSelectors: [] as string[]
    };

    let totalMatches = 0;
    let possibleMatches = 0;

    // Check selectors
    if (rule.selectors && rule.selectors.length > 0) {
      for (const selector of rule.selectors) {
        try {
          const elements = await page.locator(selector);
          const count = await elements.count();
          if (count > 0) {
            result.matchedSelectors.push({ selector, count });
            totalMatches++;
          }
          possibleMatches++;
        } catch (error) {
          // Selector might be invalid, continue
          possibleMatches++;
        }
      }
    }

    // Check excluded selectors
    if (rule.excludeSelectors && rule.excludeSelectors.length > 0) {
      for (const selector of rule.excludeSelectors) {
        try {
          const elements = await page.locator(selector);
          const count = await elements.count();
          if (count > 0) {
            result.excludedSelectors.push(selector);
            // Presence of excluded selectors reduces confidence
            totalMatches = Math.max(0, totalMatches - 1);
          }
        } catch (error) {
          // Continue
        }
      }
    }

    // Check URL patterns
    if (rule.urlPatterns && rule.urlPatterns.length > 0) {
      for (const pattern of rule.urlPatterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(url)) {
            result.matchedUrlPatterns.push(pattern);
            totalMatches++;
          }
          possibleMatches++;
        } catch (error) {
          // Invalid regex, continue
          possibleMatches++;
        }
      }
    }

    // Check content patterns
    if (rule.contentPatterns && rule.contentPatterns.length > 0) {
      const lowerContent = content.toLowerCase();
      for (const pattern of rule.contentPatterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(lowerContent)) {
            result.matchedContentPatterns.push(pattern);
            totalMatches++;
          }
          possibleMatches++;
        } catch (error) {
          // Invalid regex, continue
          possibleMatches++;
        }
      }
    }

    // Calculate confidence
    if (possibleMatches > 0) {
      const requiredCount = rule.requiredCount || 1;
      const baseConfidence = Math.min(totalMatches / Math.max(requiredCount, 1), 1.0);
      result.confidence = baseConfidence * (rule.weight || 1.0);
      result.matched = totalMatches >= requiredCount && result.excludedSelectors.length === 0;
    }

    return result;
  }

  /**
   * Detect the current state of a page using generic detection rules
   */
  public async detectPageState(
    page: Page, 
    customRuleSets?: PageDetectionRuleSet[],
    options?: {
      includeBuiltInRules?: boolean;
      defaultState?: string;
      confidenceThreshold?: number;
    }
  ): Promise<WorkflowState> {
    const startTime = Date.now();
    
    try {
      const content = await page.content();
      const url = page.url();
      
      console.log(`Analyzing page state for URL: ${url}`);
      
      // Get detection rule sets
      const builtInRuleSets = this.getBuiltInDetectionRuleSetsAsRecord();
      const includeBuiltIn = options?.includeBuiltInRules !== false; // Default to true
      const ruleSetsToEvaluate: PageDetectionRuleSet[] = [];
      
      // Add built-in rule sets if requested
      if (includeBuiltIn) {
        ruleSetsToEvaluate.push(...Object.values(builtInRuleSets));
      }
      
      // Add custom rule sets
      if (customRuleSets && customRuleSets.length > 0) {
        ruleSetsToEvaluate.push(...customRuleSets);
      }
      
      // If no rule sets available, return default state
      if (ruleSetsToEvaluate.length === 0) {
        console.log('No detection rule sets available, returning default state');
        return options?.defaultState || 'unknown';
      }
      
      const stateResults: Array<{
        stateName: string;
        confidence: number;
        ruleSet: PageDetectionRuleSet;
        matchedRules: any[];
      }> = [];
      
      // Evaluate each rule set
      for (const ruleSet of ruleSetsToEvaluate) {
        let totalConfidence = 0;
        let totalWeight = 0;
        const matchedRules = [];
        
        for (const rule of ruleSet.rules) {
          const ruleResult = await this.evaluateDetectionRule(page, rule, content, url);
          
          if (ruleResult.matched || ruleResult.confidence > 0) {
            matchedRules.push({
              ruleName: rule.name,
              ruleDescription: rule.description,
              matchedSelectors: ruleResult.matchedSelectors,
              matchedUrlPatterns: ruleResult.matchedUrlPatterns,
              matchedContentPatterns: ruleResult.matchedContentPatterns,
              excludedSelectors: ruleResult.excludedSelectors,
              weight: rule.weight || 1.0
            });
            
            totalConfidence += ruleResult.confidence;
            totalWeight += rule.weight || 1.0;
          }
        }
        
        // Calculate overall confidence for this state
        const normalizedConfidence = totalWeight > 0 ? totalConfidence / totalWeight : 0;
        const minimumConfidence = ruleSet.minimumConfidence || 0.5;
        
        if (normalizedConfidence >= minimumConfidence) {
          stateResults.push({
            stateName: ruleSet.stateName,
            confidence: normalizedConfidence,
            ruleSet,
            matchedRules
          });
          
          console.log(`State "${ruleSet.stateName}" confidence: ${normalizedConfidence.toFixed(2)} (threshold: ${minimumConfidence})`);
        }
      }
      
      // Sort by confidence and return the best match
      stateResults.sort((a, b) => b.confidence - a.confidence);
      
      const evaluationTime = Date.now() - startTime;
      
      if (stateResults.length > 0) {
        const bestMatch = stateResults[0];
        console.log(`Detected page state: "${bestMatch.stateName}" with confidence ${bestMatch.confidence.toFixed(2)}`);
        console.log(`Evaluation completed in ${evaluationTime}ms`);
        return bestMatch.stateName;
      } else {
        console.log(`No state detected above confidence threshold, returning default state`);
        console.log(`Evaluation completed in ${evaluationTime}ms`);
        return options?.defaultState || 'unknown';
      }
      
    } catch (error) {
      console.error('Error detecting page state:', error);
      return options?.defaultState || 'unknown';
    }
  }

  /**
   * Get detailed page state detection results (for debugging/analysis)
   */
  public async detectPageStateDetailed(
    page: Page, 
    customRuleSets?: PageDetectionRuleSet[],
    options?: {
      includeBuiltInRules?: boolean;
      defaultState?: string;
      confidenceThreshold?: number;
    }
  ): Promise<PageStateDetectionResult> {
    const startTime = Date.now();
    
    try {
      const content = await page.content();
      const url = page.url();
      
      // Get detection rule sets
      const builtInRuleSets = this.getBuiltInDetectionRuleSetsAsRecord();
      const includeBuiltIn = options?.includeBuiltInRules !== false;
      const ruleSetsToEvaluate: PageDetectionRuleSet[] = [];
      
      if (includeBuiltIn) {
        ruleSetsToEvaluate.push(...Object.values(builtInRuleSets));
      }
      
      if (customRuleSets && customRuleSets.length > 0) {
        ruleSetsToEvaluate.push(...customRuleSets);
      }
      
      const allMatchedRules = [];
      const detectedElements: { selector: string; count: number }[] = [];
      let bestState = options?.defaultState || 'unknown';
      let bestConfidence = 0;
      
      // Evaluate all rule sets
      for (const ruleSet of ruleSetsToEvaluate) {
        let totalConfidence = 0;
        let totalWeight = 0;
        
        for (const rule of ruleSet.rules) {
          const ruleResult = await this.evaluateDetectionRule(page, rule, content, url);
          
          // Collect detected elements for debugging
          detectedElements.push(...ruleResult.matchedSelectors);
          
          if (ruleResult.matched || ruleResult.confidence > 0) {
            allMatchedRules.push({
              ruleName: rule.name,
              ruleDescription: rule.description,
              matchedSelectors: ruleResult.matchedSelectors,
              matchedUrlPatterns: ruleResult.matchedUrlPatterns,
              matchedContentPatterns: ruleResult.matchedContentPatterns,
              excludedSelectors: ruleResult.excludedSelectors,
              weight: rule.weight || 1.0
            });
            
            totalConfidence += ruleResult.confidence;
            totalWeight += rule.weight || 1.0;
          }
        }
        
        const normalizedConfidence = totalWeight > 0 ? totalConfidence / totalWeight : 0;
        const minimumConfidence = ruleSet.minimumConfidence || 0.5;
        
        if (normalizedConfidence >= minimumConfidence && normalizedConfidence > bestConfidence) {
          bestState = ruleSet.stateName;
          bestConfidence = normalizedConfidence;
        }
      }
      
      const evaluationTime = Date.now() - startTime;
      
      return {
        state: bestState,
        confidence: bestConfidence,
        url,
        matchedRules: allMatchedRules,
        detectedElements,
        metadata: {
          totalRulesEvaluated: ruleSetsToEvaluate.reduce((sum, rs) => sum + rs.rules.length, 0),
          evaluationTimeMs: evaluationTime,
          contentLength: content.length
        }
      };
      
    } catch (error) {
      console.error('Error in detailed page state detection:', error);
      const evaluationTime = Date.now() - startTime;
      
      return {
        state: options?.defaultState || 'unknown',
        confidence: 0,
        url: page.url(),
        matchedRules: [],
        detectedElements: [],
        metadata: {
          totalRulesEvaluated: 0,
          evaluationTimeMs: evaluationTime,
          contentLength: 0
        }
      };
    }
  }

  /**
   * Create detection rule sets for common page patterns
   */
  public createDetectionRuleSet(
    stateName: string,
    options: {
      description?: string;
      selectors?: string[];
      urlPatterns?: string[];
      contentPatterns?: string[];
      excludeSelectors?: string[];
      minimumConfidence?: number;
      weight?: number;
    }
  ): PageDetectionRuleSet {
    return {
      name: stateName,
      description: options.description || `Custom detection for ${stateName} state`,
      stateName,
      minimumConfidence: options.minimumConfidence || 0.5,
      rules: [
        {
          name: `${stateName}_detection`,
          description: options.description || `Detect ${stateName} state`,
          selectors: options.selectors,
          urlPatterns: options.urlPatterns,
          contentPatterns: options.contentPatterns,
          excludeSelectors: options.excludeSelectors,
          weight: options.weight || 1.0
        }
      ]
    };
  }

  /**
   * Extract custom detection rules from Intent Spec steps
   */
  public extractDetectionRulesFromIntentSpec(steps: (IntentSpecStep | IntentSpecWithDetection)[]): PageDetectionRuleSet[] {
    const customRuleSets: PageDetectionRuleSet[] = [];
    
    for (const step of steps) {
      const extendedStep = step as IntentSpecWithDetection;
      
      // Add custom page detection rule sets if defined
      if (extendedStep.pageDetectionRuleSets) {
        customRuleSets.push(...extendedStep.pageDetectionRuleSets);
      }
      
      // Process default detection rule sets if specified
      if (extendedStep.defaultDetectionRuleSets) {
        const builtInRuleSets = this.getBuiltInDetectionRuleSetsAsRecord();
        for (const ruleSetName of extendedStep.defaultDetectionRuleSets) {
          if (builtInRuleSets[ruleSetName]) {
            customRuleSets.push(builtInRuleSets[ruleSetName]);
          }
        }
      }
    }
    
    return customRuleSets;
  }

  /**
   * Categorize Intent Spec steps based on their content and optional category mapping
   */
  public categorizeSteps(
    steps: IntentSpecStep[],
    options?: {
      /** Custom categorization rules */
      rules?: CategorizationRule[];
      /** Legacy category mappings for backward compatibility */
      categoryMappings?: { [key: string]: string[] };
      /** Default category for steps that don't match any rules */
      defaultCategory?: StepCategory;
      /** Whether to validate prerequisites */
      validatePrerequisites?: boolean;
    }
  ): CategorizedStep[] {
    const {
      rules,
      categoryMappings,
      defaultCategory = 'main_flow',
      validatePrerequisites = false
    } = options || {};

    // Build categorization rules from legacy mappings or defaults
    let categorizationRules = rules;
    
    if (!categorizationRules) {
      const mappings = categoryMappings || this.getDefaultCategoryMappings();
      categorizationRules = this.convertMappingsToRules(mappings);
    }

    // Categorize each step
    const categorizedSteps = steps.map(step => {
      // If step already has a category, use it
      if (step.category) {
        return { ...step, category: step.category };
      }

      // Find the first matching rule
      const matchingRule = this.findMatchingCategorizationRule(step, categorizationRules!);
      
      return {
        ...step,
        category: matchingRule ? matchingRule.category : defaultCategory
      };
    });

    // Validate prerequisites if requested
    if (validatePrerequisites) {
      this.validateStepPrerequisites(categorizedSteps);
    }

    return categorizedSteps;
  }

  /**
   * Get default category mappings for backward compatibility
   */
  private getDefaultCategoryMappings(): { [key: string]: string[] } {
    return {
      'authentication': ['login', 'password', 'sign in', 'email', 'signin', 'username', 'authenticate', 'auth'],
      'setup': ['setup', 'configure', 'initialize', 'install', 'config'],
      'navigation': ['goto', 'navigate', 'click', 'visit', 'open', 'url'],
      'form_input': ['fill', 'type', 'input', 'enter', 'submit', 'form'],
      'verification': ['wait', 'expect', 'assert', 'check', 'verify', 'validate'],
      'cleanup': ['cleanup', 'reset', 'clear', 'logout', 'signout', 'close'],
      'main_flow': [] // Default fallback category
    };
  }

  /**
   * Convert legacy category mappings to categorization rules
   */
  private convertMappingsToRules(mappings: { [key: string]: string[] }): CategorizationRule[] {
    const rules: CategorizationRule[] = [];
    let priority = 100;

    for (const [category, keywords] of Object.entries(mappings)) {
      if (category === 'main_flow' || keywords.length === 0) continue;
      
      rules.push({
        name: category,
        category: category as StepCategory,
        priority: priority--,
        keywords: keywords
      });
    }

    return rules;
  }

  /**
   * Find the first categorization rule that matches a step
   */
  private findMatchingCategorizationRule(
    step: IntentSpecStep, 
    rules: CategorizationRule[]
  ): CategorizationRule | null {
    // Sort rules by priority (highest first)
    const sortedRules = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    for (const rule of sortedRules) {
      if (this.evaluateCategorizationRule(step, rule)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Evaluate whether a categorization rule matches a step
   */
  private evaluateCategorizationRule(step: IntentSpecStep, rule: CategorizationRule): boolean {
    // Check custom evaluator first (highest priority)
    if (rule.evaluator) {
      return rule.evaluator(step);
    }

    // Check metadata keys
    if (rule.metadataKeys && step.metadata) {
      const hasMetadataMatch = rule.metadataKeys.some(key => {
        const value = step.metadata![key];
        return value === true || 
               value === 'true' || 
               value === rule.category ||
               (typeof value === 'string' && value.toLowerCase() === rule.category.toLowerCase());
      });
      if (hasMetadataMatch) {
        return true;
      }
    }

    // Check keyword matching
    if (rule.keywords && rule.keywords.length > 0) {
      const stepName = step.name.toLowerCase();
      const snippet = (step.snippet || '').toLowerCase();
      const metadataText = step.metadata ? 
        Object.values(step.metadata)
          .filter(v => typeof v === 'string')
          .join(' ').toLowerCase() : '';
      
      const hasKeywordMatch = rule.keywords.some(keyword => 
        stepName.includes(keyword.toLowerCase()) || 
        snippet.includes(keyword.toLowerCase()) ||
        metadataText.includes(keyword.toLowerCase())
      );
      if (hasKeywordMatch) {
        return true;
      }
    }

    // Check regex patterns
    if (rule.patterns && rule.patterns.length > 0) {
      const stepContent = `${step.name} ${step.snippet || ''}`;
      const hasPatternMatch = rule.patterns.some(pattern => pattern.test(stepContent));
      if (hasPatternMatch) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate that all step prerequisites are satisfied
   */
  private validateStepPrerequisites(steps: CategorizedStep[]): void {
    const stepNames = new Set(steps.map(step => step.name));
    
    for (const step of steps) {
      if (step.prerequisites) {
        for (const prerequisite of step.prerequisites) {
          if (!stepNames.has(prerequisite)) {
            console.warn(`Step "${step.name}" has unresolved prerequisite: "${prerequisite}"`);
          }
        }
      }
    }
  }

  /**
   * Helper method to create a categorization rule
   */
  public static createCategorizationRule(config: {
    name: string;
    category: StepCategory;
    priority?: number;
    keywords?: string[];
    patterns?: (string | RegExp)[];
    metadataKeys?: string[];
    evaluator?: (step: IntentSpecStep) => boolean;
  }): CategorizationRule {
    return {
      name: config.name,
      category: config.category,
      priority: config.priority || 50,
      keywords: config.keywords,
      patterns: config.patterns?.map(p => typeof p === 'string' ? new RegExp(p, 'i') : p),
      metadataKeys: config.metadataKeys,
      evaluator: config.evaluator
    };
  }

  /**
   * Find the index of the first step matching a specific category in categorized steps
   */
  public findFirstStepByCategory(categorizedSteps: CategorizedStep[], targetCategory: StepCategory = 'main_flow'): number {
    const firstMatchIndex = categorizedSteps.findIndex(step => step.category === targetCategory);
    return firstMatchIndex === -1 ? 0 : firstMatchIndex;
  }

  /**
   * Find the index of the first main flow step in categorized steps (backward compatibility)
   */
  public findFirstMainFlowStep(categorizedSteps: CategorizedStep[]): number {
    return this.findFirstStepByCategory(categorizedSteps, 'main_flow');
  }

  /**
   * Evaluate if a workflow condition is met
   */
  public async evaluateCondition(
    condition: WorkflowCondition, 
    page: Page, 
    currentState: WorkflowState
  ): Promise<boolean> {
    try {
      // Check required state
      if (condition.requiredState && condition.requiredState !== currentState) {
        return false;
      }

      // Check excluded states
      if (condition.excludedStates && condition.excludedStates.includes(currentState)) {
        return false;
      }

      // Check URL patterns
      if (condition.urlPatterns && condition.urlPatterns.length > 0) {
        const currentUrl = page.url();
        const urlMatches = condition.urlPatterns.some(pattern => pattern.test(currentUrl));
        if (!urlMatches) {
          return false;
        }
      }

      // Check custom evaluator
      if (condition.customEvaluator) {
        return await condition.customEvaluator(page, currentState);
      }

      return true;
    } catch (error) {
      console.error('Error evaluating condition:', error);
      return false;
    }
  }

  /**
   * Check if a step should be skipped based on its skip conditions
   */
  public async shouldSkipStep(
    step: IntentSpecStep, 
    currentState: WorkflowState,
    page: Page
  ): Promise<boolean> {
    if (!step.skipConditions || step.skipConditions.length === 0) {
      return false;
    }

    for (const condition of step.skipConditions) {
      const shouldSkip = await this.evaluateCondition(condition, page, currentState);
      if (shouldSkip) {
        const reason = condition.requiredState 
          ? `Step skipped: current state '${currentState}' matches skip condition '${condition.requiredState}'`
          : 'Step skipped: skip condition met';
        console.log(`Step "${step.name}": ${reason}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a step can execute based on its execution conditions
   */
  public async canExecuteStep(
    step: IntentSpecStep, 
    page: Page, 
    currentState: WorkflowState
  ): Promise<{ canExecute: boolean; reason?: string }> {
    if (!step.executeConditions || step.executeConditions.length === 0) {
      return { canExecute: true };
    }

    for (const condition of step.executeConditions) {
      const canExecute = await this.evaluateCondition(condition, page, currentState);
      if (!canExecute) {
        const reason = condition.requiredState 
          ? `Step cannot execute: required state '${condition.requiredState}' not met (current: '${currentState}')`
          : 'Step cannot execute: execution condition not met';
        return { canExecute: false, reason };
      }
    }

    return { canExecute: true };
  }


  /**
   * Get built-in detection rule sets for common page states
   */
  public getBuiltInDetectionRuleSets(): PageDetectionRuleSet[] {
    return [
      {
        name: 'Authentication Detection',
        description: 'Detects if user is authenticated',
        stateName: 'authenticated',
        minimumConfidence: 0.6,
        rules: [
          {
            name: 'logout_button',
            description: 'Logout/Sign out button present',
            selectors: ['button:has-text("logout")', 'button:has-text("sign out")', 'a:has-text("logout")', 'a:has-text("sign out")'],
            weight: 2.0
          },
          {
            name: 'dashboard_url',
            description: 'Dashboard/app URL patterns',
            urlPatterns: ['.*dashboard.*', '.*app/.*', '.*/home(?!/|$).*'],
            weight: 1.5
          },
          {
            name: 'user_menu',
            description: 'User menu/profile elements',
            selectors: ['.user-menu', '.profile-menu', '[data-testid*="user"]', '[data-testid*="profile"]'],
            weight: 1.0
          }
        ]
      },
      {
        name: 'Login Page Detection',
        description: 'Detects login/signin pages',
        stateName: 'login_page',
        minimumConfidence: 0.5,
        rules: [
          {
            name: 'login_form',
            description: 'Login form elements',
            selectors: ['input[type="password"]', 'input[name*="password"]', 'input[name*="email"]', 'input[name*="username"]'],
            requiredCount: 2,
            weight: 2.0
          },
          {
            name: 'login_url',
            description: 'Login URL patterns',
            urlPatterns: ['.*login.*', '.*signin.*', '.*sign-in.*'],
            weight: 1.5
          },
          {
            name: 'no_logout',
            description: 'No logout button present',
            excludeSelectors: ['button:has-text("logout")', 'a:has-text("logout")'],
            weight: 0.5
          }
        ]
      }
    ];
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