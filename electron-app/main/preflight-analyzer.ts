import { Page } from 'playwright';
import { getMagnitudeAgent } from './llm';

/**
 * Pre-Flight Analyzer
 * Extracts page elements and state before step execution to:
 * 1. Skip unnecessary steps
 * 2. Prevent failures
 * 3. Choose optimal execution strategy
 */

export interface PreFlightAnalysis {
  pageState: {
    url: string;
    title: string;
    readyState: string;
    hasErrors: boolean;
  };
  targetElement: {
    exists: boolean;
    visible: boolean;
    enabled: boolean;
    selector: string;
    alternativeSelectors?: string[];
    attributes?: Record<string, string>;
  } | null;
  skipRecommendation: {
    shouldSkip: boolean;
    reason?: string;
    confidence: number;
  };
  executionStrategy: {
    method: 'snippet' | 'ai' | 'hybrid';
    reason: string;
    fallbackMethod?: 'snippet' | 'ai';
  };
  pageContent?: {
    relevantText?: string;
    formFields?: Array<{
      name: string;
      type: string;
      value: string;
      label?: string;
    }>;
    buttons?: Array<{
      text: string;
      selector: string;
    }>;
  };
}

export class PreFlightAnalyzer {
  private magnitudeAgent: any;

  constructor() {
    // Magnitude agent will be initialized when needed
  }

  /**
   * Analyze page state before executing a step
   */
  async analyzeBeforeStep(
    page: Page,
    step: any,
    variables: Record<string, string> = {}
  ): Promise<PreFlightAnalysis> {
    const startTime = Date.now();
    
    try {
      // Get basic page state
      const pageState = await this.getPageState(page);
      
      // Extract target element if snippet contains selectors
      const targetElement = await this.extractTargetElement(page, step, variables);
      
      // Determine if step should be skipped
      const skipRecommendation = await this.evaluateSkipConditions(
        page,
        step,
        pageState,
        targetElement
      );
      
      // Choose execution strategy
      const executionStrategy = this.determineExecutionStrategy(
        step,
        targetElement,
        pageState
      );
      
      // Extract relevant page content for AI fallback
      const pageContent = executionStrategy.method === 'ai' || executionStrategy.fallbackMethod === 'ai'
        ? await this.extractPageContent(page, step)
        : undefined;

      console.log(`Pre-flight analysis completed in ${Date.now() - startTime}ms`);
      
      return {
        pageState,
        targetElement,
        skipRecommendation,
        executionStrategy,
        pageContent
      };
    } catch (error) {
      console.error('Pre-flight analysis error:', error);
      
      // Return safe defaults on error
      return {
        pageState: {
          url: await page.url(),
          title: await page.title(),
          readyState: 'unknown',
          hasErrors: true
        },
        targetElement: null,
        skipRecommendation: {
          shouldSkip: false,
          confidence: 0
        },
        executionStrategy: {
          method: 'ai', // Use AI when pre-flight fails
          reason: 'Pre-flight analysis failed, using AI as fallback'
        }
      };
    }
  }

  /**
   * Get current page state
   */
  private async getPageState(page: Page): Promise<PreFlightAnalysis['pageState']> {
    const [url, title, readyState, hasErrors] = await Promise.all([
      page.url(),
      page.title(),
      page.evaluate(() => document.readyState),
      page.evaluate(() => {
        // Check for common error indicators
        const errorKeywords = ['error', 'failed', '404', '500', 'not found', 'unauthorized'];
        const pageText = document.body?.innerText?.toLowerCase() || '';
        return errorKeywords.some(keyword => pageText.includes(keyword));
      })
    ]);

    return { url, title, readyState, hasErrors };
  }

  /**
   * Extract information about the target element from the step
   */
  private async extractTargetElement(
    page: Page,
    step: any,
    variables: Record<string, string>
  ): Promise<PreFlightAnalysis['targetElement']> {
    try {
      // Replace variables in snippet
      let snippet = step.snippet || '';
      for (const [key, value] of Object.entries(variables)) {
        snippet = snippet.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      // Extract selector from snippet
      const selector = this.extractSelectorFromSnippet(snippet);
      if (!selector) return null;

      // Check if element exists
      const element = await page.locator(selector).first();
      const exists = await element.count() > 0;
      
      if (!exists) {
        // Try to find alternative selectors using AI
        const alternatives = await this.findAlternativeSelectors(page, step, selector);
        return {
          exists: false,
          visible: false,
          enabled: false,
          selector,
          alternativeSelectors: alternatives
        };
      }

      // Get element properties
      const [visible, enabled, attributes] = await Promise.all([
        element.isVisible(),
        element.isEnabled(),
        element.evaluate(el => {
          const attrs: Record<string, string> = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }
          return attrs;
        })
      ]);

      return {
        exists,
        visible,
        enabled,
        selector,
        attributes
      };
    } catch (error) {
      console.error('Error extracting target element:', error);
      return null;
    }
  }

  /**
   * Extract selector from Playwright snippet
   */
  private extractSelectorFromSnippet(snippet: string): string | null {
    // Match various Playwright selector patterns
    const patterns = [
      /page\.click\(['"]([^'"]+)['"]\)/,
      /page\.fill\(['"]([^'"]+)['"],/,
      /page\.locator\(['"]([^'"]+)['"]\)/,
      /page\.getByRole\(([^)]+)\)/,
      /page\.getByLabel\(['"]([^'"]+)['"]\)/,
      /page\.getByText\(['"]([^'"]+)['"]\)/,
      /page\.getByTestId\(['"]([^'"]+)['"]\)/
    ];

    for (const pattern of patterns) {
      const match = snippet.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Evaluate if step should be skipped
   */
  private async evaluateSkipConditions(
    page: Page,
    step: any,
    pageState: PreFlightAnalysis['pageState'],
    targetElement: PreFlightAnalysis['targetElement']
  ): Promise<PreFlightAnalysis['skipRecommendation']> {
    // Check if already in desired state
    if (step.targetState) {
      const currentState = await this.detectCurrentState(page, step.targetState);
      if (currentState.matches) {
        return {
          shouldSkip: true,
          reason: `Already in target state: ${step.targetState}`,
          confidence: currentState.confidence
        };
      }
    }

    // Skip if navigation step and already on target URL
    if (step.snippet?.includes('goto')) {
      const targetUrl = this.extractUrlFromGoto(step.snippet);
      if (targetUrl && pageState.url.includes(targetUrl)) {
        return {
          shouldSkip: true,
          reason: 'Already on target page',
          confidence: 0.9
        };
      }
    }

    // Skip if form field already has correct value
    if (step.snippet?.includes('fill')) {
      const fillValue = await this.checkFormFieldValue(page, step);
      if (fillValue.alreadyCorrect) {
        return {
          shouldSkip: true,
          reason: `Field already contains value: ${fillValue.currentValue}`,
          confidence: 0.95
        };
      }
    }

    // Skip if target element doesn't exist and step allows continuation
    if (targetElement && !targetElement.exists && step.continueOnFailure) {
      return {
        shouldSkip: true,
        reason: 'Target element not found, step marked as optional',
        confidence: 0.8
      };
    }

    return {
      shouldSkip: false,
      confidence: 0
    };
  }

  /**
   * Determine the best execution strategy for the step
   */
  private determineExecutionStrategy(
    step: any,
    targetElement: PreFlightAnalysis['targetElement'],
    pageState: PreFlightAnalysis['pageState']
  ): PreFlightAnalysis['executionStrategy'] {
    // Use snippet-first for navigation (100% predictable)
    if (step.snippet?.includes('goto')) {
      return {
        method: 'snippet',
        reason: 'Navigation steps are predictable and should use snippets'
      };
    }

    // Use snippet-first for form fields with stable selectors
    if (targetElement?.exists && targetElement.visible && targetElement.enabled) {
      return {
        method: 'snippet',
        reason: 'Target element exists and is interactable',
        fallbackMethod: 'ai'
      };
    }

    // Use AI for content validation
    if (step.name?.toLowerCase().includes('verify') || 
        step.name?.toLowerCase().includes('check') ||
        step.name?.toLowerCase().includes('validate')) {
      return {
        method: 'ai',
        reason: 'Content validation requires AI analysis'
      };
    }

    // Use AI for dynamic element detection
    if (targetElement && !targetElement.exists && targetElement.alternativeSelectors?.length) {
      return {
        method: 'hybrid',
        reason: 'Original selector failed, trying alternatives with AI assistance',
        fallbackMethod: 'ai'
      };
    }

    // Use AI for error recovery
    if (pageState.hasErrors) {
      return {
        method: 'ai',
        reason: 'Page contains errors, using AI for recovery'
      };
    }

    // Default to snippet with AI fallback
    return {
      method: 'snippet',
      reason: 'Default strategy: snippet-first with AI fallback',
      fallbackMethod: 'ai'
    };
  }

  /**
   * Extract relevant page content for AI processing
   */
  private async extractPageContent(page: Page, step: any): Promise<PreFlightAnalysis['pageContent']> {
    try {
      // Initialize Magnitude agent for extraction
      if (!this.magnitudeAgent) {
        this.magnitudeAgent = await getMagnitudeAgent();
      }

      // Use Magnitude's extract to get structured page data
      const extractionSchema = {
        relevantText: 'string',
        formFields: [{
          name: 'string',
          type: 'string',
          value: 'string',
          label: 'string?'
        }],
        buttons: [{
          text: 'string',
          selector: 'string'
        }]
      };

      const extracted = await this.magnitudeAgent.extract({
        page,
        schema: extractionSchema,
        prompt: `Extract form fields and buttons relevant to: ${step.name}`
      });

      return extracted;
    } catch (error) {
      console.error('Error extracting page content:', error);
      
      // Fallback to basic extraction
      const relevantText = await page.locator('body').textContent();
      return {
        relevantText: relevantText?.substring(0, 1000) // Limit text length
      };
    }
  }

  /**
   * Helper: Detect current state
   */
  private async detectCurrentState(page: Page, targetState: string): Promise<{ matches: boolean; confidence: number }> {
    // This would use your existing page state detection logic
    // For now, return a simple check
    const pageText = await page.locator('body').textContent();
    const stateKeywords = this.getStateKeywords(targetState);
    
    const matches = stateKeywords.some(keyword => 
      pageText?.toLowerCase().includes(keyword.toLowerCase())
    );

    return {
      matches,
      confidence: matches ? 0.8 : 0.2
    };
  }

  /**
   * Helper: Get state keywords
   */
  private getStateKeywords(state: string): string[] {
    const stateMap: Record<string, string[]> = {
      'logged_in': ['dashboard', 'logout', 'profile', 'welcome'],
      'checkout': ['payment', 'billing', 'order total', 'place order'],
      'search_results': ['results', 'found', 'showing', 'sort by'],
      // Add more states as needed
    };

    return stateMap[state] || [state];
  }

  /**
   * Helper: Extract URL from goto command
   */
  private extractUrlFromGoto(snippet: string): string | null {
    const match = snippet.match(/goto\(['"]([^'"]+)['"]\)/);
    return match ? match[1] : null;
  }

  /**
   * Helper: Check form field value
   */
  private async checkFormFieldValue(page: Page, step: any): Promise<{ alreadyCorrect: boolean; currentValue?: string }> {
    try {
      const match = step.snippet?.match(/fill\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
      if (!match) return { alreadyCorrect: false };

      const [, selector, expectedValue] = match;
      const currentValue = await page.locator(selector).inputValue();
      
      return {
        alreadyCorrect: currentValue === expectedValue,
        currentValue
      };
    } catch {
      return { alreadyCorrect: false };
    }
  }

  /**
   * Helper: Find alternative selectors using AI
   */
  private async findAlternativeSelectors(page: Page, step: any, originalSelector: string): Promise<string[]> {
    try {
      if (!this.magnitudeAgent) {
        this.magnitudeAgent = await getMagnitudeAgent();
      }

      // Use Magnitude's query to find alternatives
      const result = await this.magnitudeAgent.query({
        page,
        prompt: `Find alternative selectors for element that was supposed to match: ${originalSelector}. 
                 The step is trying to: ${step.name}.
                 Return up to 3 alternative selectors as a JSON array.`
      });

      if (Array.isArray(result)) {
        return result;
      }

      return [];
    } catch {
      return [];
    }
  }
}