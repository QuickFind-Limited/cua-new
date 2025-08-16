import { IntentSpec, IntentStep, FlowResult, FlowMetrics, ActionContext, LogEntry, ExtractionResult } from '../flows/types';
import { executeMagnitudeAct, executeMagnitudeQuery } from './llm';
import { PlaywrightExecutor } from './playwright-executor';
import { FlowStorage } from './flow-storage';
import { EventEmitter } from 'events';

export interface MagnitudeExecutionOptions {
  headless?: boolean;
  timeout?: number;
  retries?: number;
  saveScreenshots?: boolean;
  saveFlow?: boolean;
}

export interface ExecutionProgress {
  stepIndex: number;
  totalSteps: number;
  currentStep: IntentStep;
  status: 'executing' | 'completed' | 'failed' | 'extracting';
  screenshot?: string;
  extractedData?: any;
  error?: string;
  timestamp: Date;
}

/**
 * Main class for executing Intent Specs using hybrid model approach
 * - Uses Sonnet 4 for 'act' operations (reasoning about actions)
 * - Uses Opus 4.1 for 'query' operations (data extraction)
 * - Orchestrates Playwright for browser automation
 */
export class MagnitudeExecutor extends EventEmitter {
  private playwrightExecutor: PlaywrightExecutor;
  private flowStorage: FlowStorage;
  private metrics: FlowMetrics;
  private logs: LogEntry[] = [];
  private currentContext: ActionContext | null = null;

  constructor(options: MagnitudeExecutionOptions = {}) {
    super();
    this.playwrightExecutor = new PlaywrightExecutor({
      headless: options.headless ?? false,
      timeout: options.timeout ?? 30000,
      saveScreenshots: options.saveScreenshots ?? true
    });
    this.flowStorage = new FlowStorage();
    
    this.metrics = {
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      stepsExecuted: 0,
      stepsTotal: 0,
      retryCount: 0,
      browserInteractions: 0,
      llmCalls: {
        act: 0,
        query: 0
      }
    };
  }

  /**
   * Execute a complete flow from an Intent Spec
   * @param spec The Intent Specification to execute
   * @param variables Variables to substitute in the spec
   * @param options Execution options
   * @returns Promise<FlowResult> with execution results
   */
  async executeFlow(
    spec: IntentSpec, 
    variables: Record<string, string> = {},
    options: MagnitudeExecutionOptions = {}
  ): Promise<FlowResult> {
    try {
      this.log('info', `Starting execution of flow: ${spec.name}`);
      this.metrics.startTime = new Date();
      this.metrics.stepsTotal = spec.steps.length;

      // Initialize browser
      await this.playwrightExecutor.initialize();
      
      // Navigate to start URL with variable substitution
      const startUrl = this.substituteVariables(spec.startUrl, variables);
      await this.playwrightExecutor.navigate(startUrl);
      
      this.updateContext();
      this.log('info', `Navigated to: ${startUrl}`);

      const extractedData: Record<string, any> = {};
      const screenshots: string[] = [];

      // Execute each step
      for (let i = 0; i < spec.steps.length; i++) {
        const step = spec.steps[i];
        this.metrics.stepsExecuted = i + 1;

        try {
          await this.executeStep(step, variables, i, extractedData, screenshots);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.log('error', `Step ${i + 1} failed: ${errorMessage}`, { step, error });
          
          // Attempt retry if configured
          if (options.retries && options.retries > 0) {
            this.log('info', `Retrying step ${i + 1} (attempt ${this.metrics.retryCount + 1})`);
            this.metrics.retryCount++;
            
            try {
              await this.executeStep(step, variables, i, extractedData, screenshots);
            } catch (retryError) {
              throw new Error(`Step ${i + 1} failed after retry: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          } else {
            throw error;
          }
        }
      }

      // Verify success condition
      const successResult = await this.verifySuccess(spec.successCheck, variables);
      if (!successResult.success) {
        throw new Error(`Success verification failed: ${successResult.error}`);
      }

      this.metrics.endTime = new Date();
      this.metrics.duration = this.metrics.endTime.getTime() - this.metrics.startTime.getTime();

      const result: FlowResult = {
        success: true,
        data: extractedData,
        logs: this.logs.map(log => `[${log.level.toUpperCase()}] ${log.message}`),
        metrics: this.metrics,
        screenshots
      };

      // Save flow if requested
      if (options.saveFlow) {
        await this.flowStorage.saveExecutedFlow(spec, variables, result);
      }

      this.log('info', `Flow completed successfully in ${this.metrics.duration}ms`);
      return result;

    } catch (error) {
      this.metrics.endTime = new Date();
      this.metrics.duration = this.metrics.endTime.getTime() - this.metrics.startTime.getTime();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Flow execution failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        logs: this.logs.map(log => `[${log.level.toUpperCase()}] ${log.message}`),
        metrics: this.metrics
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Execute a single step with hybrid model approach
   */
  private async executeStep(
    step: IntentStep,
    variables: Record<string, string>,
    stepIndex: number,
    extractedData: Record<string, any>,
    screenshots: string[]
  ): Promise<void> {
    this.log('info', `Executing step ${stepIndex + 1}: ${step.action} on ${step.target}`);

    // Emit progress
    this.emit('progress', {
      stepIndex,
      totalSteps: this.metrics.stepsTotal,
      currentStep: step,
      status: 'executing',
      timestamp: new Date()
    } as ExecutionProgress);

    // 1. Use Sonnet 4 for reasoning about the action
    this.log('debug', 'Using Sonnet 4 for action reasoning...');
    const context = await this.getCurrentPageContext();
    const actionReasoning = await executeMagnitudeAct(context, step);
    this.metrics.llmCalls.act++;

    this.log('debug', `Action reasoning: ${actionReasoning.action}`);

    // 2. Substitute variables in step
    const processedStep = this.processStepVariables(step, variables);

    // 3. Execute the action with Playwright
    const actionResult = await this.playwrightExecutor.executeAction(processedStep);
    this.metrics.browserInteractions++;

    if (!actionResult.success) {
      throw new Error(`Action execution failed: ${actionResult.error}`);
    }

    // 4. Take screenshot after action
    if (this.playwrightExecutor.config.saveScreenshots) {
      const screenshot = await this.playwrightExecutor.takeScreenshot(`step-${stepIndex + 1}`);
      if (screenshot) {
        screenshots.push(screenshot);
      }
    }

    // 5. Handle data extraction if specified
    if ((step as any).extract) {
      this.log('debug', 'Using Opus 4.1 for data extraction...');
      
      this.emit('progress', {
        stepIndex,
        totalSteps: this.metrics.stepsTotal,
        currentStep: step,
        status: 'extracting',
        timestamp: new Date()
      } as ExecutionProgress);

      const pageContent = await this.playwrightExecutor.getPageContent();
      const extractedResult = await executeMagnitudeQuery(pageContent.html, (step as any).extract);
      this.metrics.llmCalls.query++;

      extractedData[`step_${stepIndex + 1}`] = extractedResult;
      this.log('info', `Data extracted from step ${stepIndex + 1}`);

      this.emit('progress', {
        stepIndex,
        totalSteps: this.metrics.stepsTotal,
        currentStep: step,
        status: 'completed',
        extractedData: extractedResult,
        timestamp: new Date()
      } as ExecutionProgress);
    } else {
      this.emit('progress', {
        stepIndex,
        totalSteps: this.metrics.stepsTotal,
        currentStep: step,
        status: 'completed',
        timestamp: new Date()
      } as ExecutionProgress);
    }

    // Update current context
    this.updateContext();

    // Add delay if specified
    if (step.timeout) {
      await this.playwrightExecutor.wait(step.timeout);
    }
  }

  /**
   * Verify success condition using current page state
   */
  private async verifySuccess(
    successCheck: string,
    variables: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const processedCheck = this.substituteVariables(successCheck, variables);
      const pageContent = await this.playwrightExecutor.getPageContent();
      
      // Use Opus 4.1 for verification
      const verificationResult = await executeMagnitudeQuery(
        pageContent.html, 
        `Verify if this condition is met: ${processedCheck}. Return {"success": true/false, "reason": "explanation"}`
      );
      this.metrics.llmCalls.query++;

      if (typeof verificationResult === 'object' && verificationResult.success !== undefined) {
        return {
          success: verificationResult.success,
          error: verificationResult.success ? undefined : verificationResult.reason
        };
      }

      // Fallback to simple text search
      const textContent = pageContent.text.toLowerCase();
      const checkContent = processedCheck.toLowerCase();
      const success = textContent.includes(checkContent);

      return {
        success,
        error: success ? undefined : `Success condition "${processedCheck}" not found on page`
      };
    } catch (error) {
      return {
        success: false,
        error: `Success verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get current page context for LLM reasoning
   */
  private async getCurrentPageContext(): Promise<string> {
    const pageInfo = await this.playwrightExecutor.getPageInfo();
    const context = {
      url: pageInfo.url,
      title: pageInfo.title,
      viewport: pageInfo.viewport,
      timestamp: new Date().toISOString()
    };

    return `Current page context:
URL: ${context.url}
Title: ${context.title}
Viewport: ${context.viewport.width}x${context.viewport.height}
Timestamp: ${context.timestamp}`;
  }

  /**
   * Update action context
   */
  private async updateContext(): Promise<void> {
    const pageInfo = await this.playwrightExecutor.getPageInfo();
    this.currentContext = {
      pageTitle: pageInfo.title,
      pageUrl: pageInfo.url,
      viewport: pageInfo.viewport,
      timestamp: new Date(),
      stepNumber: this.metrics.stepsExecuted
    };
  }

  /**
   * Substitute variables in strings
   */
  private substituteVariables(text: string, variables: Record<string, string>): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }
    return result;
  }

  /**
   * Process step variables
   */
  private processStepVariables(step: IntentStep, variables: Record<string, string>): IntentStep {
    return {
      ...step,
      target: this.substituteVariables(step.target, variables),
      value: this.substituteVariables(step.value, variables)
    };
  }

  /**
   * Log message with context
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any): void {
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      step: this.metrics.stepsExecuted
    };

    this.logs.push(logEntry);
    console.log(`[${level.toUpperCase()}] ${message}`, context || '');
  }

  /**
   * Get execution logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get current metrics
   */
  getMetrics(): FlowMetrics {
    return { ...this.metrics };
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      await this.playwrightExecutor.cleanup();
    } catch (error) {
      this.log('error', `Cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop execution (for external control)
   */
  async stop(): Promise<void> {
    this.log('info', 'Stopping execution...');
    await this.cleanup();
  }
}