import Anthropic from '@anthropic-ai/sdk';

export interface DecisionSignals {
  isCIEnvironment: boolean;
  selectorStability: 'high' | 'medium' | 'low';
  elementVisibility: 'visible' | 'hidden' | 'partial';
  pageLoadTime: number; // milliseconds
  previousStepSuccess: boolean;
  stepComplexity: 'simple' | 'medium' | 'complex';
  hasJavaScript: boolean;
  domStability: 'stable' | 'changing' | 'dynamic';
  networkLatency: number; // milliseconds
  currentAttempt: number;
  maxAttempts: number;
}

export interface DecisionResult {
  choice: 'act' | 'snippet';
  confidence: number; // 0-1 scale
  rationale: string;
}

export class OpusDecider {
  private anthropic: Anthropic;
  
  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  async decide(signals: DecisionSignals, context?: string): Promise<DecisionResult> {
    const prompt = this.buildDecisionPrompt(signals, context);
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022', // Using the most capable available model
        max_tokens: 500,
        temperature: 0.1, // Low temperature for consistent decision making
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return this.parseDecisionResponse(content.text);
      } else {
        throw new Error('Unexpected response type from Claude');
      }
    } catch (error) {
      console.error('Error making decision with Claude:', error);
      // Fallback to rule-based decision
      return this.fallbackDecision(signals);
    }
  }

  private buildDecisionPrompt(signals: DecisionSignals, context?: string): string {
    return `You are an expert automation system that decides between two execution strategies:

1. **ACT**: Use Claude's computer use capability to directly interact with the UI
2. **SNIPPET**: Execute a pre-written code snippet for this specific action

Given the following signals about the current automation context, decide which approach to use:

**Environment Signals:**
- CI Environment: ${signals.isCIEnvironment}
- Selector Stability: ${signals.selectorStability}
- Element Visibility: ${signals.elementVisibility}
- Page Load Time: ${signals.pageLoadTime}ms
- Previous Step Success: ${signals.previousStepSuccess}
- Step Complexity: ${signals.stepComplexity}
- Has JavaScript: ${signals.hasJavaScript}
- DOM Stability: ${signals.domStability}
- Network Latency: ${signals.networkLatency}ms
- Current Attempt: ${signals.currentAttempt}/${signals.maxAttempts}

${context ? `**Additional Context:**\n${context}\n` : ''}

**Decision Criteria:**
- ACT is better for: dynamic content, visual validation, complex interactions, one-off tasks
- SNIPPET is better for: stable selectors, CI environments, repeated actions, performance-critical paths

Respond with a JSON object containing:
{
  "choice": "act" or "snippet",
  "confidence": number between 0 and 1,
  "rationale": "brief explanation of the decision"
}

Focus on reliability and performance. In CI environments, favor snippets when selectors are stable.`;
  }

  private parseDecisionResponse(response: string): DecisionResult {
    try {
      // Extract JSON from response if it's wrapped in other text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate the response structure
      if (!parsed.choice || !['act', 'snippet'].includes(parsed.choice)) {
        throw new Error('Invalid choice in response');
      }
      
      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error('Invalid confidence in response');
      }
      
      return {
        choice: parsed.choice,
        confidence: parsed.confidence,
        rationale: parsed.rationale || 'No rationale provided'
      };
    } catch (error) {
      console.error('Error parsing Claude response:', error);
      console.error('Raw response:', response);
      
      // Return a conservative fallback
      return {
        choice: 'snippet',
        confidence: 0.5,
        rationale: 'Failed to parse Claude response, defaulting to snippet for safety'
      };
    }
  }

  private fallbackDecision(signals: DecisionSignals): DecisionResult {
    // Rule-based fallback when Claude API fails
    let score = 0;
    let reasons: string[] = [];

    // Favor snippets in CI
    if (signals.isCIEnvironment) {
      score += 30;
      reasons.push('CI environment detected');
    }

    // Selector stability matters
    if (signals.selectorStability === 'high') {
      score += 25;
      reasons.push('high selector stability');
    } else if (signals.selectorStability === 'low') {
      score -= 20;
      reasons.push('low selector stability');
    }

    // Element visibility
    if (signals.elementVisibility === 'visible') {
      score += 15;
      reasons.push('element clearly visible');
    } else if (signals.elementVisibility === 'hidden') {
      score -= 25;
      reasons.push('element not visible');
    }

    // Step complexity
    if (signals.stepComplexity === 'simple') {
      score += 20;
      reasons.push('simple step');
    } else if (signals.stepComplexity === 'complex') {
      score -= 15;
      reasons.push('complex step');
    }

    // DOM stability
    if (signals.domStability === 'stable') {
      score += 20;
      reasons.push('stable DOM');
    } else if (signals.domStability === 'dynamic') {
      score -= 25;
      reasons.push('dynamic DOM');
    }

    // Performance considerations
    if (signals.pageLoadTime > 3000 || signals.networkLatency > 200) {
      score += 10;
      reasons.push('slow network conditions');
    }

    // Retry logic
    if (signals.currentAttempt > 1) {
      score -= 15;
      reasons.push(`retry attempt ${signals.currentAttempt}`);
    }

    const choice = score > 50 ? 'snippet' : 'act';
    const confidence = Math.min(0.9, Math.max(0.3, Math.abs(score) / 100));

    return {
      choice,
      confidence,
      rationale: `Fallback decision: ${choice} (score: ${score}) - ${reasons.join(', ')}`
    };
  }
}

// Convenience function for quick decisions
export async function makeDecision(
  apiKey: string,
  signals: DecisionSignals,
  context?: string
): Promise<DecisionResult> {
  const decider = new OpusDecider(apiKey);
  return await decider.decide(signals, context);
}