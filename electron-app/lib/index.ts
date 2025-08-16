// Utility libraries for electron-app automation

export {
  OpusDecider,
  makeDecision,
  type DecisionSignals,
  type DecisionResult
} from './decider';

export {
  SpecToActPromptBuilder,
  buildActPrompt,
  buildBatchActPrompt,
  createContextFromSpec,
  type IntentStep,
  type IntentSpec,
  type PromptContext,
  type ActPromptOptions
} from './specToActPrompt';