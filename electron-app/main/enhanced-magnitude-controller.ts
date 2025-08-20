import { WebContentsView } from 'electron';
import { Browser, Page } from 'playwright';
import { PreFlightAnalyzer, PreFlightAnalysis } from './preflight-analyzer';
import { ErrorAnalyzer, ErrorAnalysis } from './error-analyzer';
import { getMagnitudeAgent, executeRuntimeAIAction } from './llm';

/**
 * Enhanced Magnitude WebView Controller
 * Integrates Pre-Flight Analysis, Enhanced Error Recovery, and Smart Skip Logic
 */

interface ExecutionResult {
  success: boolean;
  error?: string;
  data?: any;
  skipped?: boolean;
  skipReason?: string;
  executionMethod?: 'snippet' | 'ai' | 'hybrid';
  retryCount?: number;
  recoveryActions?: string[];
}

interface StepExecutionContext {
  step: any;
  variables: Record<string, string>;
  retryCount: number;
  previousErrors: Error[];
  skipHistory: string[];
}

export class EnhancedMagnitudeController {
  private webView: WebContentsView | null = null;
  private playwrightPage: Page | null = null;
  private playwrightBrowser: Browser | null = null;
  private isConnected = false;
  
  private preFlightAnalyzer: PreFlightAnalyzer;
  private errorAnalyzer: ErrorAnalyzer;
  private magnitudeAgent: any = null;
  
  // Execution statistics for optimization
  private executionStats = {
    snippetSuccess: 0,
    snippetFailure: 0,
    aiSuccess: 0,
    aiFailure: 0,
    skippedSteps: 0,
    totalSteps: 0
  };

  constructor() {
    this.preFlightAnalyzer = new PreFlightAnalyzer();
    this.errorAnalyzer = new ErrorAnalyzer();
  }

  /**
   * Connect to WebView using Playwright CDP
   */
  public async connectToWebView(webView: WebContentsView): Promise<boolean> {
    try {
      this.webView = webView;
      
      // Import chromium from playwright
      const { chromium } = await import('playwright');
      
      // Get CDP port from environment or use the same port as main.ts
      const cdpPort = process.env.CDP_PORT || '9335';
      const cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
      
      console.log(`Connecting Playwright to CDP endpoint: ${cdpEndpoint}`);
      
      // Connect to the browser via CDP
      this.playwrightBrowser = await chromium.connectOverCDP(cdpEndpoint);
      
      if (!this.playwrightBrowser) {
        console.error('Failed to connect browser via CDP');
        return false;
      }
      
      // Get existing contexts or create new one
      const contexts = this.playwrightBrowser.contexts();
      if (contexts.length > 0) {
        // Use existing context
        const context = contexts[0];
        const pages = context.pages();
        
        if (pages.length > 0) {
          // CRITICAL: Filter out Electron UI pages and only use WebView pages
          // Electron UI pages typically have chrome-extension:// or devtools:// URLs
          let webViewPage = null;
          
          for (const page of pages) {
            const url = page.url();
            console.log(`Found page with URL: ${url}`);
            
            // Skip Electron chrome/UI pages
            if (url.startsWith('chrome-extension://') || 
                url.startsWith('devtools://') ||
                url.startsWith('chrome://') ||
                url.includes('localhost:') && url.includes('tabbar.html')) {
              console.log('Skipping Electron UI page');
              continue;
            }
            
            // This should be a WebView page (actual web content)
            webViewPage = page;
            console.log('Found WebView page, using it for automation');
            break;
          }
          
          if (webViewPage) {
            this.playwrightPage = webViewPage;
          } else {
            console.error('No WebView page found, only Electron UI pages detected');
            return false;
          }
        } else {
          // Create new page
          this.playwrightPage = await context.newPage();
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
      
      // Don't clear cookies/session - it affects the WebView's initial state
      // The enhanced-flow-executor will navigate to the correct URL anyway
      
      this.isConnected = true;
      console.log('Successfully connected Playwright to WebContentsView');
      return true;
    } catch (error) {
      console.error('Failed to connect to WebView:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      return false;
    }
  }

  /**
   * Enhanced step execution with pre-flight analysis and intelligent error recovery
   */
  public async executeStepEnhanced(
    step: any,
    variables: Record<string, string> = {},
    context?: StepExecutionContext
  ): Promise<ExecutionResult> {
    if (!this.isConnected || !this.playwrightPage) {
      return {
        success: false,
        error: 'Not connected to WebView'
      };
    }

    const executionContext = context || {
      step,
      variables,
      retryCount: 0,
      previousErrors: [],
      skipHistory: []
    };

    this.executionStats.totalSteps++;

    try {
      // STEP 1: Pre-Flight Analysis
      console.log(`🔍 Pre-flight analysis for: ${step.name}`);
      const preFlightAnalysis = await this.preFlightAnalyzer.analyzeBeforeStep(
        this.playwrightPage,
        step,
        variables
      );

      // STEP 2: Check Skip Conditions
      if (preFlightAnalysis.skipRecommendation.shouldSkip) {
        console.log(`⏭️ Skipping step: ${preFlightAnalysis.skipRecommendation.reason}`);
        this.executionStats.skippedSteps++;
        
        return {
          success: true,
          skipped: true,
          skipReason: preFlightAnalysis.skipRecommendation.reason,
          executionMethod: 'snippet' // Not actually executed
        };
      }

      // STEP 3: Execute Based on Strategy
      const executionMethod = preFlightAnalysis.executionStrategy.method;
      console.log(`🎯 Execution strategy: ${executionMethod} - ${preFlightAnalysis.executionStrategy.reason}`);

      let result: ExecutionResult;

      switch (executionMethod) {
        case 'snippet':
          result = await this.executeWithSnippet(step, variables, preFlightAnalysis);
          break;
          
        case 'ai':
          result = await this.executeWithAI(step, variables, preFlightAnalysis);
          break;
          
        case 'hybrid':
          result = await this.executeHybrid(step, variables, preFlightAnalysis);
          break;
          
        default:
          result = await this.executeWithSnippet(step, variables, preFlightAnalysis);
      }

      // Update statistics
      if (result.success) {
        if (executionMethod === 'ai') {
          this.executionStats.aiSuccess++;
        } else {
          this.executionStats.snippetSuccess++;
        }
      }

      return result;

    } catch (error) {
      console.error(`❌ Step execution failed: ${error}`);
      
      // STEP 4: Enhanced Error Analysis
      const errorAnalysis = await this.errorAnalyzer.analyzeError(
        error,
        step,
        this.playwrightPage,
        executionContext.retryCount
      );

      // STEP 5: Attempt Recovery
      const recoveryResult = await this.attemptRecovery(
        errorAnalysis,
        executionContext
      );

      if (recoveryResult.success) {
        return recoveryResult;
      }

      // Update failure statistics
      this.executionStats.snippetFailure++;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: executionContext.retryCount,
        recoveryActions: errorAnalysis.suggestedActions.map(a => a.description)
      };
    }
  }

  /**
   * Execute step using Playwright snippet
   */
  private async executeWithSnippet(
    step: any,
    variables: Record<string, string>,
    preFlightAnalysis: PreFlightAnalysis
  ): Promise<ExecutionResult> {
    try {
      // Replace variables in snippet
      let snippet = step.snippet || '';
      for (const [key, value] of Object.entries(variables)) {
        snippet = snippet.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      console.log(`📝 Executing snippet: ${snippet.substring(0, 100)}...`);

      // If target element doesn't exist but we have alternatives, try them
      if (preFlightAnalysis.targetElement && 
          !preFlightAnalysis.targetElement.exists && 
          preFlightAnalysis.targetElement.alternativeSelectors?.length) {
        
        console.log('🔄 Trying alternative selectors...');
        for (const altSelector of preFlightAnalysis.targetElement.alternativeSelectors) {
          try {
            const altSnippet = snippet.replace(
              preFlightAnalysis.targetElement.selector,
              altSelector
            );
            const result = await this.evaluateSnippet(altSnippet);
            return {
              success: true,
              data: result,
              executionMethod: 'snippet'
            };
          } catch {
            // Try next alternative
            continue;
          }
        }
      }

      // Execute original snippet
      const result = await this.evaluateSnippet(snippet);
      
      return {
        success: true,
        data: result,
        executionMethod: 'snippet'
      };

    } catch (error) {
      // If snippet fails and we have AI fallback, use it
      if (preFlightAnalysis.executionStrategy.fallbackMethod === 'ai') {
        console.log('🤖 Snippet failed, falling back to AI...');
        return await this.executeWithAI(step, variables, preFlightAnalysis);
      }
      
      throw error;
    }
  }

  /**
   * Execute step using Magnitude AI
   */
  private async executeWithAI(
    step: any,
    variables: Record<string, string>,
    preFlightAnalysis: PreFlightAnalysis
  ): Promise<ExecutionResult> {
    try {
      // Prepare instruction for AI
      let instruction = step.aiInstruction || step.name || step.snippet || '';
      for (const [key, value] of Object.entries(variables)) {
        instruction = instruction.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      console.log(`🤖 Using Sonnet 4 for runtime AI action: ${instruction}`);

      // Determine if this needs full Magnitude (browser control) or just Sonnet (decision making)
      const needsBrowserControl = this.requiresBrowserControl(instruction);

      if (needsBrowserControl && this.playwrightPage) {
        // Complex browser interactions still use Magnitude with Sonnet
        if (!this.magnitudeAgent) {
          this.magnitudeAgent = await getMagnitudeAgent();
        }

        const result = await this.magnitudeAgent.act({
          page: this.playwrightPage,
          instruction
          // Don't pass context as it causes serialization issues
        });

        console.log(`✅ Magnitude (Sonnet) completed: ${instruction}`);
        return {
          success: true,
          data: result,
          executionMethod: 'ai'
        };
      } else {
        // Simple AI decisions use Sonnet directly (faster, cheaper)
        const pageContextString = JSON.stringify(preFlightAnalysis.pageContent);
        const result = await executeRuntimeAIAction(
          instruction,
          pageContextString
        );

        console.log(`✅ Sonnet 4 completed: ${result.result} (confidence: ${result.confidence})`);
        return {
          success: result.success,
          data: result.result,
          executionMethod: 'ai'
        };
      }

    } catch (error) {
      console.error('AI execution failed:', error);
      throw error;
    }
  }

  /**
   * Determine if instruction requires browser control vs just decision making
   */
  private requiresBrowserControl(instruction: string): boolean {
    const browserKeywords = [
      'click', 'type', 'fill', 'select', 'hover', 'scroll',
      'navigate', 'press', 'drag', 'upload', 'download'
    ];
    
    const instructionLower = instruction.toLowerCase();
    return browserKeywords.some(keyword => instructionLower.includes(keyword));
  }

  /**
   * Execute with hybrid approach (snippet + AI assistance)
   */
  private async executeHybrid(
    step: any,
    variables: Record<string, string>,
    preFlightAnalysis: PreFlightAnalysis
  ): Promise<ExecutionResult> {
    try {
      // First try snippet
      const snippetResult = await this.executeWithSnippet(step, variables, preFlightAnalysis);
      if (snippetResult.success) {
        return { ...snippetResult, executionMethod: 'hybrid' };
      }
    } catch {
      // Snippet failed, continue with AI
    }

    // Use AI to complete the task
    console.log('🔄 Hybrid execution: snippet failed, using AI...');
    const aiResult = await this.executeWithAI(step, variables, preFlightAnalysis);
    return { ...aiResult, executionMethod: 'hybrid' };
  }

  /**
   * Attempt recovery based on error analysis
   */
  private async attemptRecovery(
    errorAnalysis: ErrorAnalysis,
    context: StepExecutionContext
  ): Promise<ExecutionResult> {
    if (!errorAnalysis.isRecoverable || context.retryCount >= 3) {
      return {
        success: false,
        error: 'Recovery not possible'
      };
    }

    console.log(`🔧 Attempting recovery: ${errorAnalysis.suggestedActions[0]?.description}`);

    // Try the top suggested action
    const topAction = errorAnalysis.suggestedActions[0];
    if (!topAction) {
      return { success: false, error: 'No recovery actions available' };
    }

    switch (topAction.action) {
      case 'retry':
        // Simple retry with increased timeout
        await this.playwrightPage!.setDefaultTimeout(30000);
        return await this.executeStepEnhanced(
          context.step,
          context.variables,
          { ...context, retryCount: context.retryCount + 1 }
        );

      case 'use_ai':
        // Switch to AI execution
        if (!this.magnitudeAgent) {
          this.magnitudeAgent = await getMagnitudeAgent();
        }
        
        const aiResult = await this.executeWithAI(
          context.step,
          context.variables,
          {} as PreFlightAnalysis // Simplified for recovery
        );
        return aiResult;

      case 'wait':
        // Wait and retry
        await this.playwrightPage!.waitForTimeout(5000);
        return await this.executeStepEnhanced(
          context.step,
          context.variables,
          { ...context, retryCount: context.retryCount + 1 }
        );

      case 'refresh':
        // Refresh page and retry
        await this.playwrightPage!.reload();
        await this.playwrightPage!.waitForLoadState('networkidle');
        return await this.executeStepEnhanced(
          context.step,
          context.variables,
          { ...context, retryCount: context.retryCount + 1 }
        );

      case 'skip':
        // Skip the step
        return {
          success: true,
          skipped: true,
          skipReason: topAction.description
        };

      case 'alternative_selector':
        // Try alternative approaches
        if (errorAnalysis.alternativeApproaches?.length) {
          for (const alternative of errorAnalysis.alternativeApproaches) {
            try {
              const result = await this.evaluateSnippet(alternative.snippet);
              return {
                success: true,
                data: result,
                executionMethod: 'snippet',
                recoveryActions: ['Used alternative selector']
              };
            } catch {
              continue;
            }
          }
        }
        return { success: false, error: 'All alternatives failed' };

      default:
        return { success: false, error: 'Unknown recovery action' };
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
    
    try {
      // Create a function that executes the snippet
      // Replace 'await' at the beginning since we'll await the whole thing
      const cleanSnippet = snippet.replace(/^await\s+/, '');
      
      // Use Function constructor to create executable code
      // This allows us to execute arbitrary Playwright code
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const executeSnippet = new AsyncFunction('page', `return ${cleanSnippet}`);
      
      // Execute the snippet with the page object
      return await executeSnippet(page);
    } catch (error) {
      // If dynamic execution fails, fall back to pattern matching
      console.log('Dynamic execution failed, trying pattern matching:', error);
      
      // Handle page.goto
      if (snippet.includes('page.goto')) {
        const urlMatch = snippet.match(/page\.goto\(['"]([^'"]+)['"]\)/);
        if (urlMatch) {
          return await page.goto(urlMatch[1]);
        }
      }
      
      // Handle page.getByRole (more complex pattern)
      if (snippet.includes('page.getByRole')) {
        // Match patterns like: page.getByRole('textbox', { name: 'Email address or mobile number' })
        const roleMatch = snippet.match(/page\.getByRole\(['"](\w+)['"],\s*\{\s*name:\s*['"]([^'"]+)['"]\s*\}\)/);
        if (roleMatch) {
          const [, role, name] = roleMatch;
          return await page.getByRole(role as any, { name }).first();
        }
      }
      
      // Handle .click() at the end
      if (snippet.includes('.click()')) {
        // First get the element, then click it
        const elementSnippet = snippet.replace('.click()', '');
        const element = await this.evaluateSnippet(elementSnippet);
        if (element) {
          return await element.click();
        }
      }
      
      // Handle .fill() 
      if (snippet.includes('.fill(')) {
        const fillMatch = snippet.match(/(.+)\.fill\(['"]([^'"]+)['"]\)/);
        if (fillMatch) {
          const [, elementSnippet, value] = fillMatch;
          const element = await this.evaluateSnippet(elementSnippet);
          if (element) {
            return await element.fill(value);
          }
        }
      }
      
      // Handle page.locator
      if (snippet.includes('page.locator')) {
        const locatorMatch = snippet.match(/page\.locator\(['"]([^'"]+)['"]\)/);
        if (locatorMatch) {
          return await page.locator(locatorMatch[1]).first();
        }
      }
      
      // Handle .filter()
      if (snippet.includes('.filter(')) {
        // This is complex, skip for now and throw error
        throw new Error(`Complex filter pattern not supported: ${snippet.substring(0, 100)}`);
      }
      
      throw error;
    }
  }

  /**
   * Get execution statistics for monitoring and optimization
   */
  public getExecutionStats() {
    const total = this.executionStats.snippetSuccess + 
                  this.executionStats.snippetFailure +
                  this.executionStats.aiSuccess + 
                  this.executionStats.aiFailure;

    return {
      ...this.executionStats,
      snippetSuccessRate: total > 0 
        ? this.executionStats.snippetSuccess / total 
        : 0,
      aiSuccessRate: total > 0 
        ? this.executionStats.aiSuccess / total 
        : 0,
      skipRate: this.executionStats.totalSteps > 0
        ? this.executionStats.skippedSteps / this.executionStats.totalSteps
        : 0
    };
  }

  /**
   * Reset execution statistics
   */
  public resetStats() {
    this.executionStats = {
      snippetSuccess: 0,
      snippetFailure: 0,
      aiSuccess: 0,
      aiFailure: 0,
      skippedSteps: 0,
      totalSteps: 0
    };
  }
}