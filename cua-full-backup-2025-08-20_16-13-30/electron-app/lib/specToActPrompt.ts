export interface IntentStep {
  action: string;
  target: string;
  value: string;
  description?: string;
  timeout?: number;
  retries?: number;
}

export interface IntentSpec {
  name: string;
  startUrl: string;
  params?: string[];
  steps: IntentStep[];
  successCheck?: string;
  description?: string;
}

export interface PromptContext {
  currentStepIndex: number;
  totalSteps: number;
  goal: string;
  previousResults?: string[];
  currentUrl?: string;
  screenDescription?: string;
  variables?: Record<string, string>;
}

export interface ActPromptOptions {
  includeContext: boolean;
  verboseInstructions: boolean;
  includeErrorHandling: boolean;
  maxRetries: number;
}

export class SpecToActPromptBuilder {
  private defaultOptions: ActPromptOptions = {
    includeContext: true,
    verboseInstructions: true,
    includeErrorHandling: true,
    maxRetries: 3
  };

  buildPrompt(
    step: IntentStep,
    context: PromptContext,
    options: Partial<ActPromptOptions> = {}
  ): string {
    const opts = { ...this.defaultOptions, ...options };
    const resolvedStep = this.resolveVariables(step, context.variables || {});
    
    const sections = [
      this.buildHeader(context, opts),
      this.buildObjective(resolvedStep, context),
      this.buildInstructions(resolvedStep, opts),
      this.buildContext(context, opts),
      this.buildErrorHandling(opts),
      this.buildSuccess(resolvedStep, context)
    ];

    return sections.filter(Boolean).join('\n\n');
  }

  buildBatchPrompt(
    steps: IntentStep[],
    context: PromptContext,
    options: Partial<ActPromptOptions> = {}
  ): string {
    const opts = { ...this.defaultOptions, ...options };
    const resolvedSteps = steps.map(step => this.resolveVariables(step, context.variables || {}));
    
    const sections = [
      this.buildBatchHeader(context, opts),
      this.buildBatchObjective(resolvedSteps, context),
      this.buildBatchInstructions(resolvedSteps, opts),
      this.buildContext(context, opts),
      this.buildErrorHandling(opts),
      this.buildBatchSuccess(resolvedSteps, context)
    ];

    return sections.filter(Boolean).join('\n\n');
  }

  private buildHeader(context: PromptContext, options: ActPromptOptions): string {
    return `# Browser Automation Task

You are operating a web browser to complete a specific task. This is step ${context.currentStepIndex + 1} of ${context.totalSteps} in the automation sequence.

**Goal**: ${context.goal}`;
  }

  private buildBatchHeader(context: PromptContext, options: ActPromptOptions): string {
    return `# Browser Automation Sequence

You are operating a web browser to complete a sequence of related tasks. You need to execute multiple steps in order.

**Goal**: ${context.goal}
**Total Steps**: ${context.totalSteps}`;
  }

  private buildObjective(step: IntentStep, context: PromptContext): string {
    let objective = `## Current Objective\n\n`;
    
    switch (step.action.toLowerCase()) {
      case 'click':
        objective += `Click on the element with selector: \`${step.target}\``;
        if (step.description) {
          objective += `\nDescription: ${step.description}`;
        }
        break;
        
      case 'type':
        objective += `Type the text "${step.value}" into the element with selector: \`${step.target}\``;
        if (step.description) {
          objective += `\nDescription: ${step.description}`;
        }
        break;
        
      case 'wait':
        if (step.target.match(/^\d+$/)) {
          objective += `Wait for ${step.target} milliseconds`;
        } else {
          objective += `Wait for element with selector \`${step.target}\` to appear`;
        }
        break;
        
      case 'navigate':
        objective += `Navigate to URL: ${step.target}`;
        break;
        
      case 'scroll':
        objective += `Scroll ${step.target} (e.g., "down", "up", "to-bottom")`;
        break;
        
      case 'hover':
        objective += `Hover over the element with selector: \`${step.target}\``;
        break;
        
      case 'select':
        objective += `Select option "${step.value}" from dropdown with selector: \`${step.target}\``;
        break;
        
      default:
        objective += `Perform action "${step.action}" on element with selector: \`${step.target}\``;
        if (step.value) {
          objective += ` with value: "${step.value}"`;
        }
    }

    return objective;
  }

  private buildBatchObjective(steps: IntentStep[], context: PromptContext): string {
    let objective = `## Sequence Objectives\n\n`;
    
    steps.forEach((step, index) => {
      objective += `**Step ${index + 1}**: `;
      
      switch (step.action.toLowerCase()) {
        case 'click':
          objective += `Click \`${step.target}\``;
          break;
        case 'type':
          objective += `Type "${step.value}" into \`${step.target}\``;
          break;
        case 'wait':
          objective += step.target.match(/^\d+$/) ? 
            `Wait ${step.target}ms` : 
            `Wait for \`${step.target}\``;
          break;
        case 'navigate':
          objective += `Navigate to ${step.target}`;
          break;
        default:
          objective += `${step.action} \`${step.target}\``;
      }
      
      objective += '\n';
    });

    return objective;
  }

  private buildInstructions(step: IntentStep, options: ActPromptOptions): string {
    if (!options.verboseInstructions) {
      return '';
    }

    let instructions = `## Instructions\n\n`;
    
    instructions += `1. First, take a screenshot to see the current state of the page\n`;
    instructions += `2. Look for the target element using the provided selector\n`;
    instructions += `3. If the element is not immediately visible, scroll or wait as needed\n`;
    
    switch (step.action.toLowerCase()) {
      case 'click':
        instructions += `4. Click on the element precisely\n`;
        instructions += `5. Wait for any page changes or loading to complete\n`;
        break;
        
      case 'type':
        instructions += `4. Click on the input field to focus it\n`;
        instructions += `5. Clear any existing content if necessary\n`;
        instructions += `6. Type the specified text\n`;
        break;
        
      case 'wait':
        if (step.target.match(/^\d+$/)) {
          instructions += `4. Wait for the specified time duration\n`;
        } else {
          instructions += `4. Monitor the page until the element appears\n`;
          instructions += `5. Use polling to check element presence\n`;
        }
        break;
    }

    if (step.timeout) {
      instructions += `\n**Timeout**: Complete this action within ${step.timeout}ms\n`;
    }

    return instructions;
  }

  private buildBatchInstructions(steps: IntentStep[], options: ActPromptOptions): string {
    if (!options.verboseInstructions) {
      return '';
    }

    return `## Instructions

Execute the steps in order. For each step:

1. Take a screenshot to verify current state
2. Locate the target element
3. Perform the required action
4. Verify the action completed successfully
5. Proceed to the next step only after current step succeeds

**Important**: 
- Stop execution if any step fails after retries
- Take screenshots between steps to document progress
- Wait for page changes to complete before proceeding`;
  }

  private buildContext(context: PromptContext, options: ActPromptOptions): string {
    if (!options.includeContext) {
      return '';
    }

    let contextStr = `## Context\n\n`;
    
    if (context.currentUrl) {
      contextStr += `**Current URL**: ${context.currentUrl}\n`;
    }
    
    if (context.screenDescription) {
      contextStr += `**Screen Description**: ${context.screenDescription}\n`;
    }
    
    if (context.previousResults && context.previousResults.length > 0) {
      contextStr += `**Previous Steps**: \n`;
      context.previousResults.forEach((result, index) => {
        contextStr += `  ${index + 1}. ${result}\n`;
      });
    }

    if (context.variables && Object.keys(context.variables).length > 0) {
      contextStr += `**Variables**:\n`;
      Object.entries(context.variables).forEach(([key, value]) => {
        contextStr += `  - ${key}: ${value}\n`;
      });
    }

    return contextStr;
  }

  private buildErrorHandling(options: ActPromptOptions): string {
    if (!options.includeErrorHandling) {
      return '';
    }

    return `## Error Handling

If the action fails:
1. Take a screenshot to analyze the current state
2. Check if the page has changed unexpectedly
3. Look for alternative selectors or approaches
4. Retry up to ${options.maxRetries} times with slight variations
5. If all retries fail, clearly describe what went wrong

Common issues to watch for:
- Element not found or not clickable
- Page still loading or changing
- Pop-ups or overlays blocking interaction
- Network timeouts or slow responses`;
  }

  private buildSuccess(step: IntentStep, context: PromptContext): string {
    return `## Success Criteria

The step is successful when:
- The ${step.action} action has been completed
- Any expected page changes have occurred
- No error messages are visible
${step.description ? `- ${step.description}` : ''}

Take a final screenshot to confirm success before reporting completion.`;
  }

  private buildBatchSuccess(steps: IntentStep[], context: PromptContext): string {
    return `## Success Criteria

The sequence is successful when:
- All ${steps.length} steps have been completed in order
- Each step's success criteria have been met
- The final state matches the expected outcome
- No error conditions remain

Document the completion with a final screenshot showing the end state.`;
  }

  private resolveVariables(step: IntentStep, variables: Record<string, string>): IntentStep {
    const resolved = { ...step };
    
    // Replace variables in target and value fields
    resolved.target = this.substituteVariables(step.target, variables);
    resolved.value = this.substituteVariables(step.value, variables);
    
    if (step.description) {
      resolved.description = this.substituteVariables(step.description, variables);
    }
    
    return resolved;
  }

  private substituteVariables(text: string, variables: Record<string, string>): string {
    if (!text) return text;
    
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] || match;
    });
  }
}

// Convenience functions
export function buildActPrompt(
  step: IntentStep,
  context: PromptContext,
  options?: Partial<ActPromptOptions>
): string {
  const builder = new SpecToActPromptBuilder();
  return builder.buildPrompt(step, context, options);
}

export function buildBatchActPrompt(
  steps: IntentStep[],
  context: PromptContext,
  options?: Partial<ActPromptOptions>
): string {
  const builder = new SpecToActPromptBuilder();
  return builder.buildBatchPrompt(steps, context, options);
}

export function createContextFromSpec(
  spec: IntentSpec,
  currentStepIndex: number,
  variables?: Record<string, string>
): PromptContext {
  return {
    currentStepIndex,
    totalSteps: spec.steps.length,
    goal: spec.description || spec.name,
    variables: variables || {},
    currentUrl: spec.startUrl
  };
}