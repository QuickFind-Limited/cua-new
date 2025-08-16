// Dynamic import for ES module
let queryFunction: any = null;

async function getQueryFunction() {
  if (!queryFunction) {
    const claudeCode = await import('@anthropic-ai/claude-code');
    queryFunction = claudeCode.query;
  }
  return queryFunction;
}

import Anthropic from '@anthropic-ai/sdk';
import { Agent } from 'magnitude-core';
import { IntentSpec } from '../flows/types';
import { validateIntentSpec, sanitizeIntentSpec } from './intent-spec-validator';
import { serializeRecording } from './recording-serializer';
import { generateIntentSpecPrompt, generateSimpleIntentSpecPrompt, generateValidationPrompt as generatePromptForValidation } from './intent-spec-prompt';

// Model configuration per spec
const OPUS_MODEL = 'claude-opus-4-1-20250805';
const SONNET_MODEL = 'claude-sonnet-4-20250514';

// Initialize standard Anthropic SDK for Sonnet 4 (Magnitude act only)
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// Initialize Magnitude agent with proper model configuration
let magnitudeAgent: Agent | null = null;

function getMagnitudeAgent(): Agent {
  if (!magnitudeAgent) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    magnitudeAgent = new Agent({
      llm: [
        {
          provider: 'anthropic',
          options: {
            model: SONNET_MODEL,
            apiKey,
            temperature: 0.3
          },
          roles: ['act']
        },
        {
          provider: 'anthropic',
          options: {
            model: OPUS_MODEL,
            apiKey,
            temperature: 0.1
          },
          roles: ['extract', 'query']
        }
      ],
      telemetry: false
    });
  }
  return magnitudeAgent;
}

// Interfaces
interface AnalysisRequest {
  recordingData: string;
  context?: string;
}

interface AnalysisResponse {
  name: string;
  startUrl: string;
  params: string[];
  steps: Array<{
    action: string;
    target: string;
    value: string;
  }>;
  successCheck: string;
}

interface ActRequest {
  instruction: string;
  context?: string;
  parameters?: Record<string, any>;
}

interface ActResponse {
  action: string;
  result: any;
  success: boolean;
  error?: string;
}

interface QueryRequest {
  query: string;
  context?: string;
  searchScope?: string;
}

interface QueryResponse {
  answer: string;
  sources?: string[];
  confidence: number;
}

/**
 * Analyze recording using Claude Code (Opus 4.1) and return IntentSpec
 */
export async function analyzeRecording(recordingData: any): Promise<IntentSpec> {
  const maxRetries = 3;
  const retryDelay = 1000; // Start with 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Analysis attempt ${attempt}/${maxRetries}`);
      
      const promptText = createAnalysisPrompt(recordingData);
      const query = await getQueryFunction();
      let result = '';
      
      // Use Claude Code SDK with Opus 4.1 (default)
      for await (const message of query({
        prompt: promptText,
        options: {
          maxTurns: 1
        }
      })) {
        if (message.type === 'result' && message.subtype === 'success') {
          result = message.result;
        }
      }

      if (!result) {
        throw new Error('No result returned from Claude');
      }

      // Parse and validate the result
      const parsedResult = parseAndValidateIntentSpec(result);
      
      console.log('Analysis successful:', parsedResult.name);
      return parsedResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Analysis attempt ${attempt} failed:`, errorMessage);
      
      if (attempt === maxRetries) {
        throw new Error(`Analysis failed after ${maxRetries} attempts. Last error: ${errorMessage}`);
      }
      
      // Exponential backoff
      const delay = retryDelay * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Analysis failed: Maximum retries exceeded');
}

/**
 * Legacy wrapper for backward compatibility
 */
export async function analyzeRecordingLegacy(request: AnalysisRequest): Promise<AnalysisResponse> {
  const result = await analyzeRecording(request.recordingData);
  
  // Convert to legacy format for backward compatibility
  return {
    name: result.name,
    startUrl: result.startUrl || '',
    params: result.params || [],
    steps: result.steps.map(step => ({
      action: step.action,
      target: step.target || '',
      value: step.value || ''
    })),
    successCheck: result.successCheck || ''
  };
}

/**
 * Creates a comprehensive analysis prompt with examples and explicit format requirements
 */
function createAnalysisPrompt(recordingData: any): string {
  return `You are an expert at analyzing browser automation recordings and converting them to Intent Specifications.

Your task: Analyze the provided recording and output a STRICT JSON Intent Spec. NO prose, comments, or markdown - only valid JSON.

REQUIRED OUTPUT FORMAT:
{
  "name": "Clear descriptive name for this automation",
  "description": "Brief description of what this automation does",
  "url": "Starting URL (must be complete URL with protocol)",
  "params": ["PARAM1", "PARAM2"],
  "steps": [
    {
      "action": "click|type|select|wait|navigate|scroll|hover|press|clear",
      "selector": "CSS selector or element identifier",
      "value": "Value to type or {{PARAM}} for variables",
      "description": "What this step does"
    }
  ],
  "successCheck": "Selector to verify successful completion (optional)"
}

IMPORTANT RULES:
1. Use "selector" field (not "target")
2. Replace dynamic values with {{PARAM_NAME}} and list in params array
3. Common dynamic values: usernames, passwords, email addresses, dates, IDs
4. Use descriptive parameter names: {{USERNAME}}, {{PASSWORD}}, {{EMAIL}}, {{SEARCH_TERM}}
5. action must be one of: click, type, select, wait, navigate, scroll, hover, press, clear
6. Each step needs action and selector at minimum
7. Only include "value" if the action requires input (type, select)
8. Make selectors robust (prefer IDs, then data attributes, then classes)

EXAMPLE OUTPUT:
{
  "name": "Login Flow",
  "description": "Automated login process",
  "url": "https://example.com/login",
  "params": ["USERNAME", "PASSWORD"],
  "steps": [
    {
      "action": "click",
      "selector": "input[placeholder='Email']",
      "description": "Click email field"
    },
    {
      "action": "type",
      "selector": "input[placeholder='Email']",
      "value": "{{USERNAME}}",
      "description": "Enter username"
    },
    {
      "action": "click",
      "selector": "input[type='password']",
      "description": "Click password field"
    },
    {
      "action": "type",
      "selector": "input[type='password']",
      "value": "{{PASSWORD}}",
      "description": "Enter password"
    },
    {
      "action": "click",
      "selector": "button[type='submit']",
      "description": "Click login button"
    }
  ],
  "successCheck": ".dashboard, .user-profile, [data-testid='dashboard']"
}

RECORDING DATA:
${JSON.stringify(recordingData, null, 2)}

Output only the JSON Intent Spec:`;
}

/**
 * Parses Claude's response and validates the Intent Spec
 */
function parseAndValidateIntentSpec(response: string): IntentSpec {
  // Clean up the response - remove any markdown formatting or extra text
  let cleanedResponse = response.trim();
  
  // Find JSON content if wrapped in markdown or other text
  const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanedResponse = jsonMatch[0];
  }

  let parsedSpec: any;
  try {
    parsedSpec = JSON.parse(cleanedResponse);
  } catch (parseError) {
    console.error('Failed to parse Claude response as JSON:', cleanedResponse);
    throw new Error(`Invalid JSON response from Claude: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
  }

  // Validate the parsed spec
  const validation = validateIntentSpec(parsedSpec);
  
  if (!validation.valid) {
    console.error('Intent Spec validation failed:', validation.errors);
    
    // Try to sanitize and recover
    const sanitized = sanitizeIntentSpec(parsedSpec);
    const sanitizedValidation = validateIntentSpec(sanitized);
    
    if (sanitizedValidation.valid) {
      console.log('Recovered with sanitized Intent Spec');
      return sanitized as IntentSpec;
    }
    
    throw new Error(`Invalid Intent Spec: ${validation.errors.join(', ')}`);
  }

  // Additional post-processing and normalization
  if (!parsedSpec.description) {
    parsedSpec.description = `Automated workflow: ${parsedSpec.name}`;
  }

  // Normalize field names to preferred format
  if (parsedSpec.startUrl && !parsedSpec.url) {
    parsedSpec.url = parsedSpec.startUrl;
    delete parsedSpec.startUrl;
  }

  // Normalize step selectors
  if (parsedSpec.steps) {
    parsedSpec.steps = parsedSpec.steps.map((step: any) => {
      if (step.target && !step.selector) {
        step.selector = step.target;
        delete step.target;
      }
      return step;
    });
  }

  return parsedSpec as IntentSpec;
}

/**
 * Decision making using Claude Code (Opus 4.1) per spec section 7b
 */
export async function makeDecision(signals: any): Promise<{ choice: string; confidence: number; rationale: string }> {
  const promptText = `Return STRICT JSON only: {"choice":"act|snippet","confidence":0..1,"rationale":"short"}

Choose "act" (AI) or "snippet" (deterministic).
Prefer snippet: CI, reproducibility, flaky selectors.
Prefer act: flexible UI, resilience.

Signals:
${JSON.stringify(signals, null, 2)}`;

  try {
    const query = await getQueryFunction();
    let result = '';
    
    // Use Claude Code SDK with Opus 4.1
    for await (const message of query({
      prompt: promptText,
      options: {
        maxTurns: 1
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result;
      }
    }

    return JSON.parse(result);
  } catch (error) {
    throw new Error(`Decision failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Execute Magnitude act using Sonnet 4 (per spec section 7c)
 * ONLY Sonnet 4 is used for Magnitude act operations
 */
export async function executeMagnitudeAct(context: string, action: any): Promise<ActResponse> {
  try {
    const agent = getMagnitudeAgent();
    
    const instruction = `Analyze and reason about the following browser automation action in the given context.

Context:
${context}

Action to perform:
- Type: ${action.action}
- Target: ${action.target}
- Value: ${action.value}
${action.description ? `- Description: ${action.description}` : ''}

Provide reasoning about:
1. How to locate the target element effectively
2. What the action should accomplish
3. Any potential issues or considerations
4. The best approach to execute this action`;

    // Use Magnitude agent with Sonnet 4 for act operations
    await agent.act(instruction);
    
    // Since agent.act() doesn't return a value, we'll create a successful response
    // The actual action execution is handled by the MagnitudeExecutor
    return {
      action: 'Action reasoning completed',
      result: 'Magnitude agent has analyzed the action and provided guidance',
      success: true
    };
  } catch (error) {
    return {
      action: 'Action reasoning',
      result: null,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process query using Claude Code (Opus 4.1) for Magnitude query operations
 */
export async function processQuery(request: QueryRequest): Promise<QueryResponse> {
  const prompt = `Answer the following query:

Query: ${request.query}
${request.context ? `Context: ${request.context}` : ''}
${request.searchScope ? `Search Scope: ${request.searchScope}` : ''}

Return JSON: {"answer": "detailed answer", "sources": ["source1"], "confidence": 0-100}`;

  try {
    const query = await getQueryFunction();
    let result = '';
    
    // Use Claude Code SDK with Opus 4.1 for query
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 1
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result;
      }
    }

    return JSON.parse(result);
  } catch (error) {
    throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract data for Magnitude query using Claude Code (Opus 4.1)
 */
export async function extractDataForMagnitudeQuery(content: string, extractionGoal: string): Promise<any> {
  const prompt = `Extract the following from this content: ${extractionGoal}

Content:
${content}

Return the extracted data as JSON.`;

  try {
    const query = await getQueryFunction();
    let result = '';
    
    // Use Claude Code SDK with Opus 4.1
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 1
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result;
      }
    }

    return JSON.parse(result);
  } catch (error) {
    throw new Error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Execute Magnitude query using Opus 4.1 for data extraction
 * This is the main function used by MagnitudeExecutor for extraction operations
 */
export async function executeMagnitudeQuery(html: string, query: string): Promise<any> {
  try {
    const agent = getMagnitudeAgent();
    
    const extractionQuery = `Extract data based on this query from the provided HTML content.

Query: ${query}

HTML Content:
${html}

Instructions:
- Focus on extracting the specific information requested in the query
- Return structured data in JSON format when possible
- If extracting multiple items, return them as an array
- Include confidence level if uncertain about the extraction
- Return null if the requested information is not found`;

    // Use Magnitude agent's extract operation with Opus 4.1
    // Import zod for schema definition
    const { z } = await import('zod');
    
    // Define a zod schema to get JSON response
    const schema = z.object({
      data: z.any().describe('Extracted data from the HTML content'),
      confidence: z.number().optional().describe('Confidence level (0-1) in the extraction')
    });

    const result = await agent.query(extractionQuery, schema);
    
    // Return the extracted data
    return result.data || result;
  } catch (error) {
    throw new Error(`Magnitude query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build prompt from Intent Spec using Claude Code (Opus 4.1)
 */
export async function buildPromptFromSpec(spec: any): Promise<string> {
  const prompt = `Convert this Intent Spec to an actionable prompt for browser automation:
${JSON.stringify(spec, null, 2)}

Return a clear, step-by-step prompt.`;

  try {
    const query = await getQueryFunction();
    let result = '';
    
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 1
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result;
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Prompt building failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if API key is configured
 */
export function isApiKeyConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Test connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const query = await getQueryFunction();
    let success = false;
    
    for await (const message of query({
      prompt: 'Reply with {"status": "ok"}',
      options: {
        maxTurns: 1
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        const result = JSON.parse(message.result);
        success = result.status === 'ok';
      }
    }
    
    return success;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

/**
 * Validate an Intent Spec using Claude Code (Opus 4.1) - renamed to avoid conflict
 */
export async function validateIntentSpecWithClaude(intentSpec: any): Promise<{
  isValid: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  summary: string;
}> {
  try {
    const intentSpecJson = typeof intentSpec === 'string' ? intentSpec : JSON.stringify(intentSpec, null, 2);
    const promptText = generatePromptForValidation(intentSpecJson);
    
    const query = await getQueryFunction();
    let result = '';
    
    for await (const message of query({
      prompt: promptText,
      options: {
        maxTurns: 1
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result;
      }
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    const jsonResult = jsonMatch ? jsonMatch[0] : result;
    
    return JSON.parse(jsonResult);
  } catch (error) {
    return {
      isValid: false,
      score: 0,
      issues: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      suggestions: ['Please check the Intent Spec format and try again'],
      summary: 'Validation error occurred'
    };
  }
}

/**
 * Preview serialized recording without full analysis
 */
export function previewRecordingSerialization(recordingData: any): string {
  try {
    let data: any[];
    
    if (typeof recordingData === 'string') {
      try {
        data = JSON.parse(recordingData);
      } catch {
        data = [{ type: 'raw', data: recordingData }];
      }
    } else {
      data = recordingData || [];
    }

    return serializeRecording(data);
  } catch (error) {
    return `Error serializing recording: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Enhanced recording analysis with metadata extraction
 */
export async function analyzeRecordingWithMetadata(request: AnalysisRequest): Promise<{
  analysis: AnalysisResponse;
  metadata: any;
  serializedRecording: string;
}> {
  try {
    // Parse recording data
    let recordingData: any[];
    
    if (typeof request.recordingData === 'string') {
      try {
        recordingData = JSON.parse(request.recordingData);
      } catch {
        recordingData = [{ type: 'raw', data: request.recordingData }];
      }
    } else {
      recordingData = request.recordingData || [];
    }

    // Serialize recording
    const serializedRecording = serializeRecording(recordingData);
    
    // Get basic analysis using legacy wrapper to match expected return type
    const analysis = await analyzeRecordingLegacy({ recordingData: request.recordingData });
    
    // Extract metadata (simplified version - could be enhanced with another Claude call)
    const metadata = {
      stepCount: recordingData.length,
      complexity: recordingData.length > 10 ? 'complex' : recordingData.length > 5 ? 'moderate' : 'simple',
      hasNavigation: recordingData.some(action => action.type === 'navigate'),
      hasFormInput: recordingData.some(action => action.type === 'type' || action.type === 'fill'),
      hasClickActions: recordingData.some(action => action.type === 'click'),
      estimatedDuration: recordingData.length * 2, // rough estimate in seconds
      variableCount: analysis.params?.length || 0
    };

    return {
      analysis,
      metadata,
      serializedRecording
    };
  } catch (error) {
    throw new Error(`Enhanced analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}