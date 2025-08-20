import { WebContentsView } from 'electron';
import { EnhancedMagnitudeController } from './enhanced-magnitude-controller';

/**
 * Enhanced Flow Executor
 * Orchestrates the execution of Intent Specs with intelligent strategy selection
 */

export interface FlowExecutionResult {
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  skippedSteps: number;
  errors: Array<{
    stepIndex: number;
    stepName: string;
    error: string;
    recovered: boolean;
  }>;
  executionTime: number;
  executionStats: {
    snippetUsage: number;
    aiUsage: number;
    hybridUsage: number;
    successRate: number;
  };
}

export interface FlowProgress {
  currentStep: number;
  totalSteps: number;
  stepName: string;
  status: 'executing' | 'completed' | 'skipped' | 'failed' | 'recovering';
  message: string;
}

export class EnhancedFlowExecutor {
  private controller: EnhancedMagnitudeController;
  private progressCallback?: (progress: FlowProgress) => void;

  constructor() {
    this.controller = new EnhancedMagnitudeController();
  }

  /**
   * Set progress callback for real-time updates
   */
  public onProgress(callback: (progress: FlowProgress) => void) {
    this.progressCallback = callback;
  }

  /**
   * Execute an Intent Spec with enhanced strategies
   */
  public async executeFlow(
    intentSpec: any,
    variables: Record<string, string>,
    webView: WebContentsView
  ): Promise<FlowExecutionResult> {
    const startTime = Date.now();
    const errors: FlowExecutionResult['errors'] = [];
    let completedSteps = 0;
    let skippedSteps = 0;

    console.log('🚀 Starting enhanced flow execution:', intentSpec.name);

    try {
      // Connect to WebView
      const connected = await this.controller.connectToWebView(webView);
      if (!connected) {
        throw new Error('Failed to connect to WebView');
      }

      // Reset statistics for this flow
      this.controller.resetStats();

      // Execute each step with enhanced logic
      const steps = intentSpec.steps || [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Send progress update
        this.sendProgress({
          currentStep: i + 1,
          totalSteps: steps.length,
          stepName: step.name || `Step ${i + 1}`,
          status: 'executing',
          message: `Executing: ${step.name || step.snippet?.substring(0, 50)}`
        });

        try {
          // Execute with enhanced controller
          const result = await this.controller.executeStepEnhanced(step, variables);

          if (result.success) {
            if (result.skipped) {
              skippedSteps++;
              console.log(`⏭️ Step ${i + 1} skipped: ${result.skipReason}`);
              
              this.sendProgress({
                currentStep: i + 1,
                totalSteps: steps.length,
                stepName: step.name || `Step ${i + 1}`,
                status: 'skipped',
                message: result.skipReason || 'Step skipped'
              });
            } else {
              completedSteps++;
              console.log(`✅ Step ${i + 1} completed using ${result.executionMethod}`);
              
              this.sendProgress({
                currentStep: i + 1,
                totalSteps: steps.length,
                stepName: step.name || `Step ${i + 1}`,
                status: 'completed',
                message: `Completed via ${result.executionMethod}`
              });
            }
          } else {
            // Step failed
            console.error(`❌ Step ${i + 1} failed:`, result.error);
            
            errors.push({
              stepIndex: i,
              stepName: step.name || `Step ${i + 1}`,
              error: result.error || 'Unknown error',
              recovered: false
            });

            // Check if we should continue
            if (!step.continueOnFailure) {
              this.sendProgress({
                currentStep: i + 1,
                totalSteps: steps.length,
                stepName: step.name || `Step ${i + 1}`,
                status: 'failed',
                message: `Failed: ${result.error}`
              });
              
              // Critical step failed, stop execution
              break;
            }

            this.sendProgress({
              currentStep: i + 1,
              totalSteps: steps.length,
              stepName: step.name || `Step ${i + 1}`,
              status: 'failed',
              message: `Failed (continuing): ${result.error}`
            });
          }

          // Add delay between steps to avoid rate limiting
          if (i < steps.length - 1) {
            await this.delay(500);
          }

        } catch (stepError) {
          console.error(`🔥 Unexpected error in step ${i + 1}:`, stepError);
          
          errors.push({
            stepIndex: i,
            stepName: step.name || `Step ${i + 1}`,
            error: stepError instanceof Error ? stepError.message : 'Unknown error',
            recovered: false
          });

          if (!step.continueOnFailure) {
            break;
          }
        }
      }

      // Execute validation steps if present
      if (intentSpec.validationSteps) {
        console.log('🔍 Running validation steps...');
        
        for (const validationStep of intentSpec.validationSteps) {
          try {
            const result = await this.controller.executeStepEnhanced(validationStep, variables);
            if (result.success) {
              console.log(`✅ Validation passed: ${validationStep.name}`);
            } else {
              console.log(`⚠️ Validation failed: ${validationStep.name}`);
            }
          } catch (error) {
            console.error('Validation error:', error);
          }
        }
      }

      // Get execution statistics
      const stats = this.controller.getExecutionStats();
      const executionTime = Date.now() - startTime;

      // Calculate success rate
      const totalExecuted = completedSteps + errors.filter(e => !e.recovered).length;
      const successRate = totalExecuted > 0 ? completedSteps / totalExecuted : 0;

      return {
        success: errors.filter(e => !e.recovered).length === 0,
        completedSteps,
        totalSteps: steps.length,
        skippedSteps,
        errors,
        executionTime,
        executionStats: {
          snippetUsage: stats.snippetSuccess + stats.snippetFailure,
          aiUsage: stats.aiSuccess + stats.aiFailure,
          hybridUsage: 0, // Would need to track separately
          successRate
        }
      };

    } catch (error) {
      console.error('Flow execution failed:', error);
      
      return {
        success: false,
        completedSteps,
        totalSteps: intentSpec.steps?.length || 0,
        skippedSteps,
        errors: [{
          stepIndex: -1,
          stepName: 'Flow Initialization',
          error: error instanceof Error ? error.message : 'Unknown error',
          recovered: false
        }],
        executionTime: Date.now() - startTime,
        executionStats: {
          snippetUsage: 0,
          aiUsage: 0,
          hybridUsage: 0,
          successRate: 0
        }
      };
    }
  }

  /**
   * Send progress update
   */
  private sendProgress(progress: FlowProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Utility: Add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get execution recommendations based on statistics
   */
  public getExecutionRecommendations(): string[] {
    const stats = this.controller.getExecutionStats();
    const recommendations: string[] = [];

    // Analyze snippet success rate
    if (stats.snippetSuccessRate < 0.7) {
      recommendations.push(
        'Consider updating selectors - snippet success rate is below 70%'
      );
    }

    // Analyze AI usage
    const totalSteps = stats.snippetSuccess + stats.snippetFailure + 
                      stats.aiSuccess + stats.aiFailure;
    const aiUsageRate = totalSteps > 0 
      ? (stats.aiSuccess + stats.aiFailure) / totalSteps 
      : 0;

    if (aiUsageRate > 0.3) {
      recommendations.push(
        'High AI usage detected (>30%). Consider improving snippet selectors for better performance'
      );
    }

    // Analyze skip rate
    if (stats.skipRate > 0.2) {
      recommendations.push(
        'Many steps are being skipped (>20%). Flow might be optimized by removing redundant steps'
      );
    }

    // Check for repeated failures
    if (stats.snippetFailure > stats.snippetSuccess) {
      recommendations.push(
        'Snippet failures exceed successes. Page structure may have changed - consider re-recording'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Flow is performing optimally with snippet-first strategy');
    }

    return recommendations;
  }
}