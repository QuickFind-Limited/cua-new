// Use child process to handle ES module import
import { fork } from 'child_process';
import * as path from 'path';

let workerProcess: any = null;
let queryFunction: any = null;

async function getQueryFunction() {
  console.log('getQueryFunction called, queryFunction exists:', !!queryFunction);
  if (!queryFunction) {
    // Create a query function that uses the worker process
    queryFunction = async function* (options: any) {
      console.log('Query function invoked with options:', options.prompt?.substring(0, 100));
      // Ensure worker is started
      if (!workerProcess) {
        const workerPath = path.join(__dirname, 'claude-code-worker.js');
        console.log('Starting worker process at:', workerPath);
        workerProcess = fork(workerPath, [], {
          silent: false,
          env: { ...process.env }
        });
        
        // Wait for worker to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error('Worker process timeout');
            reject(new Error('Worker process failed to start'));
          }, 5000);
          
          workerProcess.once('message', (msg: any) => {
            console.log('Worker message received:', msg);
            if (msg.type === 'ready') {
              clearTimeout(timeout);
              console.log('Worker process is ready');
              resolve(true);
            }
          });
        });
      }
      
      // Send request to worker
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Claude Code SDK timeout'));
        }, 120000); // 120 second timeout
        
        workerProcess.once('message', (msg: any) => {
          clearTimeout(timeout);
          if (msg.type === 'result') {
            if (msg.success) {
              resolve(msg.data);
            } else {
              reject(new Error(msg.error));
            }
          }
        });
        
        workerProcess.send({
          type: 'analyze',
          prompt: options.prompt
        });
      });
      
      // Yield the result in the expected format
      yield {
        type: 'result',
        subtype: 'success',
        result: result
      };
    };
  }
  return queryFunction;
}

import Anthropic from '@anthropic-ai/sdk';
import { startBrowserAgent } from 'magnitude-core';
import { z } from 'zod';
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

// Magnitude agent singleton
let magnitudeAgent: any = null;

async function getMagnitudeAgent() {
  if (!magnitudeAgent) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for Magnitude');
    }

    // Initialize Magnitude with proper model configuration
    // Using array format for multiple model configurations
    magnitudeAgent = await startBrowserAgent({
      llm: [
        {
          provider: 'anthropic' as const,
          options: {
            model: SONNET_MODEL, // claude-sonnet-4-20250514
            apiKey: apiKey,
            temperature: 0.2,
            maxTokens: 1500,
            system: 'You operate a browser. Be concise, deterministic, and prefer role/label selectors.'
          },
          roles: ['act'] as const
        },
        {
          provider: 'anthropic' as const,
          options: {
            model: OPUS_MODEL, // claude-opus-4-1-20250805
            apiKey: apiKey,
            temperature: 0,
            maxTokens: 1200,
            system: 'Return only JSON that matches the provided schema. No extra text.'
          },
          roles: ['extract'] as const
        },
        {
          provider: 'anthropic' as const,
          options: {
            model: OPUS_MODEL, // claude-opus-4-1-20250805
            apiKey: apiKey,
            temperature: 0.3,
            maxTokens: 1200,
            system: 'You are a planner/arbiter. Respond with short, strict JSON when asked.'
          },
          roles: ['query'] as const
        }
      ],
      browser: { 
        launchOptions: { 
          headless: true // Set to false for debugging
        } 
      },
      narration: { level: 'silent' } // Set to 'normal' for debugging
    } as any);
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
      // Note: maxTurns of 2 allows for system message + assistant response
      for await (const message of query({
        prompt: promptText,
        options: {
          maxTurns: 2
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
 * Creates a prompt for analyzing a recording session with actual actions
 */
function createSessionAnalysisPrompt(session: any): string {
  const actions = session.actions || [];
  const url = session.url || 'Unknown URL';
  
  // Create a human-readable description of actions
  const actionDescriptions = actions.map((action: any, index: number) => {
    switch(action.type) {
      case 'navigate':
        return `${index + 1}. Navigate to: ${action.url}`;
      case 'click':
        return `${index + 1}. Click on: ${action.selector || action.element?.text || 'element'}`;
      case 'type':
        return `${index + 1}. Type "${action.value}" into: ${action.selector || 'input field'}`;
      case 'select':
        return `${index + 1}. Select "${action.value}" from: ${action.selector || 'dropdown'}`;
      case 'submit':
        return `${index + 1}. Submit form: ${action.selector || 'form'}`;
      case 'scroll':
        return `${index + 1}. Scroll to position: x=${action.scrollPosition?.x}, y=${action.scrollPosition?.y}`;
      default:
        return `${index + 1}. ${action.type}: ${JSON.stringify(action)}`;
    }
  }).join('\n');
  
  return `You are an expert at analyzing browser automation recordings and converting them to Intent Specifications.

Analyze these ACTUAL recorded user actions and create an Intent Spec. Output ONLY valid JSON.

Recording Session Details:
- Start URL: ${url}
- Total Actions: ${actions.length}
- Session ID: ${session.id || 'Unknown'}

Recorded Actions:
${actionDescriptions}

Raw Action Data:
${JSON.stringify(actions, null, 2)}

CRITICAL RULES:
1. Analyze ONLY the actual recorded actions - do not invent steps
2. Detect patterns that should be variables (usernames, passwords, search terms, etc.)
3. Each action should become a step in the Intent Spec
4. Use the actual selectors from the recording
5. Set prefer="ai" for form fields and user inputs (they may move or change)
6. Set prefer="snippet" for navigation and stable buttons

Output this EXACT JSON structure:
{
  "name": "Descriptive name based on the actions performed",
  "description": "Brief description of what this automation does",
  "url": "${url}",
  "params": ["VARIABLE_NAMES_IF_ANY"],
  "skipNavigationStates": ["authenticated_area", "dashboard", "logged_in"],
  "steps": [
    {
      "name": "Step description",
      "ai_instruction": "Natural language instruction",
      "snippet": "await page.ACTION('selector', 'value');",
      "prefer": "snippet or ai",
      "fallback": "ai or snippet",
      "selector": "The actual selector from recording",
      "value": "The actual value or {{VARIABLE}}"
    }
  ],
  "preferences": {
    "dynamic_elements": "ai",
    "simple_steps": "snippet"
  }
}

Analyze the recording and output ONLY the JSON:`;
}

/**
 * Creates a prompt for analyzing Playwright spec code
 */
function createPlaywrightSpecAnalysisPrompt(playwrightCode: string): string {
  return `You are an expert at analyzing Playwright test code and converting it to Intent Specifications.

Analyze this Playwright test recording and extract ONLY the actual user actions performed. 
IMPORTANT: Output ONLY valid JSON. No markdown, no explanations, no comments.

Playwright Test Code:
${playwrightCode}

CRITICAL RULES:
1. Extract ONLY the actual actions from the Playwright code
2. Ignore test setup/teardown code
3. The first goto() is the starting URL
4. Convert each await page.* action to an Intent Spec step
5. Detect variables (values that should be parameterized like usernames, passwords, search terms)
6. DO NOT invent or hallucinate steps that aren't in the code
7. Set prefer="ai" for form inputs (email, password, search) as they may change position
8. Set prefer="snippet" for navigation (goto) and stable elements

Output this EXACT JSON structure:
{
  "name": "Descriptive name based on the actions",
  "description": "Brief description of what this automation does",
  "url": "The first page.goto() URL",
  "params": ["VARIABLE_NAMES_HERE"],
  "skipNavigationStates": ["authenticated_area", "dashboard", "logged_in"],
  "steps": [
    {
      "name": "Step description",
      "ai_instruction": "Natural language instruction",
      "snippet": "The actual Playwright code line",
      "prefer": "snippet",
      "fallback": "ai",
      "selector": "The selector used",
      "value": "The value or {{VARIABLE}}"
    }
  ],
  "preferences": {
    "dynamic_elements": "ai",
    "simple_steps": "snippet"
  }
}

Analyze the Playwright code and output ONLY the JSON:`;
}

/**
 * Creates a comprehensive analysis prompt with examples and explicit format requirements
 */
function createAnalysisPrompt(recordingData: any): string {
  // Log the recording data for debugging
  console.log('Recording data type:', typeof recordingData);
  console.log('Recording data preview:', typeof recordingData === 'string' ? recordingData.substring(0, 500) : JSON.stringify(recordingData).substring(0, 500));
  
  // Check if it's a recording session with actions array
  if (recordingData && recordingData.actions && Array.isArray(recordingData.actions)) {
    return createSessionAnalysisPrompt(recordingData);
  }
  
  // For Playwright specs and all other cases, use the general prompt that allows inference
  // This enables Claude to intelligently infer steps from start/end URLs
  
  return `You are an expert at analyzing browser automation recordings and converting them to Intent Specifications.

Your task: Analyze the provided recording and output a STRICT JSON Intent Spec. NO prose, comments, or markdown - only valid JSON.

CRITICAL: Choose execution strategy intelligently:
- SNIPPET PREFERRED for: passwords, credit cards, SSNs, API keys, any sensitive data, stable form fields with IDs
- SNIPPET PREFERRED for: simple navigation, waiting, screenshots, elements with stable IDs/data-testid
- AI PREFERRED for: dynamic content, search results, marketing pages, elements that may move/change
- AI PREFERRED for: popups, modals, complex interactions needing context

IMPORTANT: For authentication steps (login, sign in, email, password):
- Add skipConditions with requiredState: "authenticated_area" to skip if already logged in
- This allows the flow to skip auth steps when user is already authenticated

REQUIRED OUTPUT FORMAT:
{
  "name": "Clear descriptive name for this automation",
  "description": "Brief description of what this automation does",
  "url": "Starting URL (must be complete URL with protocol)",
  "params": ["PARAM1", "PARAM2"],
  "steps": [
    {
      "name": "Step name describing the action",
      "ai_instruction": "Natural language instruction for AI to execute",
      "snippet": "await page.click('selector'); // Playwright code snippet",
      "prefer": "snippet",
      "fallback": "ai",
      "selector": "CSS selector (optional)",
      "value": "{{PARAM}} or static value (optional)"
    }
  ],
  "preferences": {
    "dynamic_elements": "ai",
    "simple_steps": "snippet"
  }
}

IMPORTANT RULES:
1. Each step MUST have: name, ai_instruction, snippet, prefer, fallback
2. INTELLIGENTLY set "prefer" based on the action type:
   - Use "snippet" for: password fields, sensitive data entry, precise form fills, API keys, credit cards, SSNs
   - Use "snippet" for: simple navigation (page.goto), waiting for elements, taking screenshots
   - Use "snippet" for: actions with stable selectors (IDs, data-testid attributes)
   - Use "ai" for: dynamic content (search results, popups, modals)
   - Use "ai" for: elements that may vary (marketing pages, A/B tests)
   - Use "ai" for: complex interactions requiring context understanding
3. Set appropriate fallback:
   - If prefer="snippet", set fallback="ai" (AI can often figure it out if snippet fails)
   - If prefer="ai", set fallback="snippet" (deterministic backup)
   - Use fallback="none" only if the other approach would definitely not work
4. snippet should be valid Playwright code - PRESERVE EXACT SELECTORS FROM RECORDING
5. CRITICAL: If the recording uses page.getByRole(), page.getByLabel(), page.getByText() - KEEP THESE EXACT SELECTORS
6. DO NOT convert modern Playwright selectors to CSS selectors - keep getByRole, getByLabel, getByText as-is
7. Replace dynamic values with {{PARAM_NAME}} and list in params array
8. Common dynamic values: usernames, passwords, email addresses, dates, IDs
9. Use descriptive parameter names: {{USERNAME}}, {{PASSWORD}}, {{EMAIL}}, {{SEARCH_TERM}}
10. ai_instruction should be clear natural language instructions
11. PRESERVE the recording's selector strategy - don't invent new selectors
12. preferences: Set based on overall pattern - if mostly forms/data entry use "snippet", if mostly dynamic use "ai"

EXAMPLE OUTPUT:
{
  "name": "Zoho Inventory Login",
  "description": "Automated login process for Zoho Inventory",
  "url": "https://inventory.zoho.com/",
  "params": ["EMAIL", "PASSWORD"],
  "steps": [
    {
      "name": "Navigate to login page",
      "ai_instruction": "Navigate to Zoho Inventory login page",
      "snippet": "await page.goto('https://inventory.zoho.com/');",
      "prefer": "snippet",
      "fallback": "none",
      "comment": "Simple navigation - snippet is reliable"
    },
    {
      "name": "Click Sign In",
      "ai_instruction": "Click the Sign In button on the homepage",
      "snippet": "await page.click('a:has-text(\"Sign In\")');",
      "prefer": "ai",
      "fallback": "snippet",
      "comment": "Marketing page button - position may vary"
    },
    {
      "name": "Enter email",
      "ai_instruction": "Enter email address in the email field",
      "snippet": "await page.getByRole('textbox', { name: 'Email address or mobile number' }).fill('{{EMAIL}}');",
      "prefer": "snippet",
      "fallback": "ai",
      "value": "{{EMAIL}}",
      "skipConditions": [{"requiredState": "authenticated_area"}],
      "comment": "PRESERVE getByRole selector from recording - more reliable than CSS"
    },
    {
      "name": "Click Next",
      "ai_instruction": "Click the Next button",
      "snippet": "await page.getByRole('button', { name: 'Next' }).click();",
      "prefer": "snippet",
      "fallback": "ai",
      "comment": "Modern Playwright selector - accessible and stable"
    },
    {
      "name": "Wait for password field",
      "ai_instruction": "Wait for password field to appear",
      "snippet": "await page.getByRole('textbox', { name: 'Enter password' }).waitFor({ timeout: 5000 });",
      "prefer": "snippet",
      "fallback": "none",
      "comment": "Using role-based selector for waiting"
    },
    {
      "name": "Enter password",
      "ai_instruction": "Enter password in the password field",
      "snippet": "await page.getByRole('textbox', { name: 'Enter password' }).fill('{{PASSWORD}}');",
      "prefer": "snippet",
      "fallback": "ai",
      "value": "{{PASSWORD}}",
      "skipConditions": [{"requiredState": "authenticated_area"}],
      "comment": "SENSITIVE DATA - always prefer snippet for passwords, keep getByRole"
    },
    {
      "name": "Complete login",
      "ai_instruction": "Click the Sign In button to complete login",
      "snippet": "await page.getByRole('button', { name: 'Sign in' }).click();",
      "prefer": "snippet",
      "fallback": "ai",
      "comment": "Preserve exact selector from recording"
    }
  ],
  "preferences": {
    "dynamic_elements": "ai",
    "simple_steps": "snippet"
  }
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
    const agent = await getMagnitudeAgent();
    
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
    const result = await agent.act(instruction);
    
    return {
      action: 'Action reasoning completed',
      result: result || 'Magnitude agent has analyzed the action and provided guidance',
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
    const agent = await getMagnitudeAgent();
    
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

    const result = await agent.extract(extractionQuery, schema);
    
    // Return the extracted data
    return result.data || result;
  } catch (error) {
    throw new Error(`Magnitude query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Execute Magnitude decision using Opus 4.1 for decision making
 * This function uses agent.query() for decision-making operations
 */
export async function executeMagnitudeDecision(context: string, options: any): Promise<{ choice: string; confidence: number; rationale: string }> {
  try {
    const agent = await getMagnitudeAgent();
    
    const decisionQuery = `Make a decision based on the provided context and options.

Context:
${context}

Options:
${JSON.stringify(options, null, 2)}

Instructions:
- Analyze the context and available options
- Make a reasoned decision based on the information provided
- Return your choice with confidence level and rationale
- Consider factors like reliability, efficiency, and appropriateness`;

    // Import zod for schema definition
    const { z } = await import('zod');
    
    // Define a zod schema for decision response
    const schema = z.object({
      choice: z.string().describe('The chosen option'),
      confidence: z.number().min(0).max(1).describe('Confidence level (0-1) in the decision'),
      rationale: z.string().describe('Brief explanation of the decision reasoning')
    });

    const result = await agent.query(decisionQuery, schema);
    
    return {
      choice: result.choice,
      confidence: result.confidence,
      rationale: result.rationale
    };
  } catch (error) {
    throw new Error(`Magnitude decision failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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