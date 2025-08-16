/**
 * Type definitions for Magnitude Flow Runner
 */

// Core Intent Types
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
  description?: string;
  startUrl: string;
  params?: string[];
  steps: IntentStep[];
  successCheck: string;
  failureCheck?: string;
  metadata?: {
    version?: string;
    author?: string;
    tags?: string[];
    category?: string;
  };
}

// Flow Result Types
export interface FlowResult {
  success: boolean;
  data?: any;
  error?: string;
  logs: string[];
  metrics?: FlowMetrics;
  screenshots?: string[];
}

export interface FlowMetrics {
  startTime: Date;
  endTime: Date;
  duration: number;
  stepsExecuted: number;
  stepsTotal: number;
  retryCount: number;
  browserInteractions: number;
  llmCalls: {
    act: number;
    query: number;
  };
}

// LLM Provider Types
export interface LLMResponse {
  content: string;
  tokens?: {
    input: number;
    output: number;
  };
  model: string;
  timestamp: Date;
}

export interface LLMProviders {
  act: any; // Anthropic instance for actions
  query: any; // Anthropic instance for queries
}

// Configuration Types
export interface FlowRunnerConfig {
  apiKey: string;
  models: {
    act: string;
    query: string;
  };
  browser: {
    headless?: boolean;
    viewport?: {
      width: number;
      height: number;
    };
    timeout?: number;
  };
  retry: {
    maxAttempts: number;
    strategy: 'linear' | 'exponential';
    baseDelay: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    saveScreenshots: boolean;
    savePageContent: boolean;
  };
}

// Error Types
export interface FlowError {
  code: string;
  message: string;
  category: 'browser' | 'selector' | 'network' | 'api' | 'validation' | 'unknown';
  severity: 'low' | 'medium' | 'high';
  retryable: boolean;
  step?: number;
  timestamp: Date;
  context?: any;
}

// Extraction Types
export interface ExtractionConfig {
  goal: string;
  format: 'json' | 'text' | 'structured';
  fields?: string[];
  validation?: {
    required?: string[];
    types?: Record<string, string>;
  };
}

export interface ExtractionResult {
  data: any;
  confidence: number;
  format: string;
  timestamp: Date;
  source: 'page_content' | 'visible_text' | 'structured_data';
}

// Action Types
export type ActionType = 
  | 'click'
  | 'type'
  | 'select'
  | 'wait'
  | 'navigate'
  | 'scroll'
  | 'hover'
  | 'drag'
  | 'drop'
  | 'upload'
  | 'download'
  | 'screenshot'
  | 'extract'
  | 'custom';

export interface ActionContext {
  pageTitle: string;
  pageUrl: string;
  viewport: {
    width: number;
    height: number;
  };
  timestamp: Date;
  stepNumber: number;
}

// Validation Types
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParameterValidation {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

// Flow Pattern Types
export interface FlowPattern {
  name: string;
  description: string;
  template: Partial<IntentSpec>;
  requiredParams: string[];
  optionalParams?: string[];
  examples?: Array<{
    name: string;
    variables: Record<string, string>;
    description: string;
  }>;
}

// Monitoring and Analytics Types
export interface FlowAnalytics {
  totalRuns: number;
  successRate: number;
  averageDuration: number;
  commonErrors: Array<{
    error: string;
    count: number;
    lastOccurrence: Date;
  }>;
  stepPerformance: Array<{
    stepIndex: number;
    action: string;
    averageDuration: number;
    failureRate: number;
  }>;
}

// Browser Automation Types
export interface BrowserState {
  url: string;
  title: string;
  readyState: string;
  viewport: {
    width: number;
    height: number;
  };
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface ElementInfo {
  selector: string;
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visible: boolean;
  enabled: boolean;
}

// Utility Types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: any;
  step?: number;
}

export interface RetryStrategy {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
}

// Constants
export const CLAUDE_MODELS = {
  ACT: 'claude-sonnet-4-20250514',
  QUERY: 'claude-opus-4-1-20250805'
} as const;

export const DEFAULT_CONFIG: FlowRunnerConfig = {
  apiKey: '',
  models: {
    act: CLAUDE_MODELS.ACT,
    query: CLAUDE_MODELS.QUERY
  },
  browser: {
    headless: false,
    viewport: {
      width: 1920,
      height: 1080
    },
    timeout: 30000
  },
  retry: {
    maxAttempts: 3,
    strategy: 'exponential',
    baseDelay: 1000
  },
  logging: {
    level: 'info',
    saveScreenshots: true,
    savePageContent: false
  }
};

// Helper type guards
export function isIntentSpec(obj: any): obj is IntentSpec {
  return (
    obj &&
    typeof obj.name === 'string' &&
    typeof obj.startUrl === 'string' &&
    Array.isArray(obj.steps) &&
    typeof obj.successCheck === 'string'
  );
}

export function isIntentStep(obj: any): obj is IntentStep {
  return (
    obj &&
    typeof obj.action === 'string' &&
    typeof obj.target === 'string' &&
    typeof obj.value === 'string'
  );
}

export function isFlowResult(obj: any): obj is FlowResult {
  return (
    obj &&
    typeof obj.success === 'boolean' &&
    Array.isArray(obj.logs)
  );
}

// Export all types
export default {
  CLAUDE_MODELS,
  DEFAULT_CONFIG,
  isIntentSpec,
  isIntentStep,
  isFlowResult
};