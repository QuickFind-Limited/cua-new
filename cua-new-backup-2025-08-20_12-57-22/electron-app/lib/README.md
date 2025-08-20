# Electron App Utility Libraries

This directory contains utility libraries for the electron automation application.

## Overview

### `decider.ts` - Opus 4.1 Decision Logic

The `OpusDecider` class uses Claude's AI capabilities to make intelligent decisions between two execution strategies:

- **ACT**: Use Claude's computer use capability for direct UI interaction
- **SNIPPET**: Execute pre-written code snippets for specific actions

#### Key Features:
- Analyzes environmental signals (CI environment, selector stability, etc.)
- Returns structured decisions with confidence scores and rationales
- Includes fallback logic for API failures
- Optimized for reliability and performance

#### Usage Example:
```typescript
import { OpusDecider, DecisionSignals } from './decider';

const decider = new OpusDecider(process.env.ANTHROPIC_API_KEY);

const signals: DecisionSignals = {
  isCIEnvironment: true,
  selectorStability: 'high',
  elementVisibility: 'visible',
  pageLoadTime: 1200,
  previousStepSuccess: true,
  stepComplexity: 'simple',
  hasJavaScript: true,
  domStability: 'stable',
  networkLatency: 150,
  currentAttempt: 1,
  maxAttempts: 3
};

const decision = await decider.decide(signals);
console.log(decision);
// { choice: "snippet", confidence: 0.85, rationale: "High selector stability and CI environment favor snippet execution" }
```

### `specToActPrompt.ts` - Prompt Builder for Magnitude Act

The `SpecToActPromptBuilder` class converts Intent Spec steps into properly formatted prompts for Claude's computer use capabilities.

#### Key Features:
- Converts automation steps to natural language instructions
- Handles variable substitution from templates
- Supports both single-step and batch operations
- Includes comprehensive error handling guidance
- Provides context about current progress and goals

#### Usage Example:
```typescript
import { buildActPrompt, createContextFromSpec } from './specToActPrompt';

// Single step execution
const step = {
  action: "type",
  target: "#username-field",
  value: "{{USERNAME}}"
};

const context = {
  currentStepIndex: 1,
  totalSteps: 5,
  goal: "Complete user login",
  variables: { USERNAME: "testuser" },
  currentUrl: "https://example.com/login"
};

const prompt = buildActPrompt(step, context);
console.log(prompt);
```

## Integration Points

Both libraries are designed to work together in the automation pipeline:

1. **Decision Phase**: Use `OpusDecider` to determine execution strategy
2. **Act Execution**: If "act" is chosen, use `SpecToActPromptBuilder` to create prompts
3. **Snippet Execution**: If "snippet" is chosen, execute pre-written automation code

## Dependencies

- `@anthropic-ai/sdk`: For Claude API integration
- TypeScript: For type safety and development experience

## Error Handling

Both libraries include comprehensive error handling:

- **Decider**: Falls back to rule-based decisions if Claude API fails
- **Prompt Builder**: Validates input and provides helpful error messages
- Both include logging for debugging and monitoring

## Performance Considerations

- Decider uses low temperature (0.1) for consistent decision-making
- Prompt builder includes caching opportunities for repeated operations
- Both are designed to minimize API calls while maintaining accuracy