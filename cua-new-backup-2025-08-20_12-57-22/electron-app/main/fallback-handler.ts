import { IntentStep } from '../flows/types';

export class FallbackHandler {
  private aiExecutor: any;
  private snippetExecutor: any;

  constructor(aiExecutor?: any, snippetExecutor?: any) {
    this.aiExecutor = aiExecutor;
    this.snippetExecutor = snippetExecutor;
  }

  async executeWithFallback(
    step: IntentStep,
    variables: Record<string, string>
  ): Promise<{
    success: boolean;
    pathUsed: 'ai' | 'snippet';
    fallbackOccurred: boolean;
    error?: string;
  }> {
    // Try preferred path first
    try {
      if (step.prefer === 'ai') {
        await this.executeAI(step.ai_instruction, variables);
        return { success: true, pathUsed: 'ai', fallbackOccurred: false };
      } else {
        await this.executeSnippet(step.snippet, variables);
        return { success: true, pathUsed: 'snippet', fallbackOccurred: false };
      }
    } catch (error) {
      // Try fallback if configured
      if (step.fallback !== 'none') {
        try {
          if (step.fallback === 'snippet') {
            await this.executeSnippet(step.snippet, variables);
            return { success: true, pathUsed: 'snippet', fallbackOccurred: true };
          } else {
            await this.executeAI(step.ai_instruction, variables);
            return { success: true, pathUsed: 'ai', fallbackOccurred: true };
          }
        } catch (fallbackError) {
          return {
            success: false,
            pathUsed: step.prefer,
            fallbackOccurred: true,
            error: `Both primary and fallback execution failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`
          };
        }
      }
      
      return {
        success: false,
        pathUsed: step.prefer,
        fallbackOccurred: false,
        error: error.message
      };
    }
  }

  private async executeAI(instruction: string, variables: Record<string, string>): Promise<void> {
    if (!this.aiExecutor) {
      throw new Error('AI executor not configured');
    }
    
    if (!instruction) {
      throw new Error('No AI instruction provided');
    }

    // Replace variables in instruction
    let processedInstruction = instruction;
    for (const [key, value] of Object.entries(variables)) {
      processedInstruction = processedInstruction.replace(
        new RegExp(`{{${key}}}`, 'g'),
        value
      );
    }

    // Execute AI instruction using the configured executor
    return await this.aiExecutor.execute(processedInstruction);
  }

  private async executeSnippet(snippet: string, variables: Record<string, string>): Promise<void> {
    if (!this.snippetExecutor) {
      throw new Error('Snippet executor not configured');
    }
    
    if (!snippet) {
      throw new Error('No snippet provided');
    }

    // Replace variables in snippet
    let processedSnippet = snippet;
    for (const [key, value] of Object.entries(variables)) {
      processedSnippet = processedSnippet.replace(
        new RegExp(`{{${key}}}`, 'g'),
        value
      );
    }

    // Execute snippet using the configured executor
    return await this.snippetExecutor.execute(processedSnippet);
  }

  // Setters for dependency injection
  setAIExecutor(executor: any): void {
    this.aiExecutor = executor;
  }

  setSnippetExecutor(executor: any): void {
    this.snippetExecutor = executor;
  }
}