import { IntentSpec, ExecutionReport, ExecutionResult } from '../flows/types';
import { Decider } from '../lib/decider';
import { FallbackHandler } from './fallback-handler';

export class ExecutionEngine {
  private decider: Decider;
  private fallbackHandler: FallbackHandler;

  constructor(aiExecutor?: any, snippetExecutor?: any) {
    this.fallbackHandler = new FallbackHandler(aiExecutor, snippetExecutor);
    this.decider = new Decider(this.fallbackHandler);
  }

  async executeIntentSpec(
    spec: IntentSpec,
    variables: Record<string, string>
  ): Promise<ExecutionReport> {
    const results = [];
    let overallSuccess = true;

    for (const step of spec.steps) {
      try {
        // Use decider to choose path
        const path = await this.decider.choosePath({
          step: step,
          prefer: spec.preferences?.[step.name] || step.prefer,
          fallbackSnippet: step.snippet || ''
        });

        // Execute with automatic fallback
        const result = await this.executeStep(step, path, variables);

        // Track which path was used
        results.push({
          step: step.name,
          pathUsed: result.pathUsed,
          fallbackOccurred: result.fallbackOccurred,
          success: result.success,
          error: result.error
        });

        // Update overall success
        if (!result.success) {
          overallSuccess = false;
        }

      } catch (error) {
        results.push({
          step: step.name,
          pathUsed: step.prefer,
          fallbackOccurred: false,
          success: false,
          error: error.message
        });
        overallSuccess = false;
      }
    }

    return { results, overallSuccess };
  }

  private async executeStep(
    step: any,
    path: 'ai' | 'snippet',
    variables: Record<string, string>
  ): Promise<ExecutionResult> {
    // Use the decider's executeWithFallback method
    return await this.decider.executeWithFallback({
      step: step,
      context: {}, // Could be enhanced with browser context
      variables: variables
    });
  }

  // Method to update executors for dependency injection
  setExecutors(aiExecutor: any, snippetExecutor: any): void {
    this.fallbackHandler.setAIExecutor(aiExecutor);
    this.fallbackHandler.setSnippetExecutor(snippetExecutor);
  }

  // Get decider instance for advanced usage
  getDecider(): Decider {
    return this.decider;
  }

  // Get fallback handler instance for advanced usage
  getFallbackHandler(): FallbackHandler {
    return this.fallbackHandler;
  }
}