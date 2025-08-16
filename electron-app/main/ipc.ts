import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { 
  analyzeRecording, 
  executeMagnitudeAct, 
  processQuery, 
  isApiKeyConfigured, 
  testConnection,
  makeDecision,
  buildPromptFromSpec,
  extractDataForMagnitudeQuery
} from './llm';
import { getTabManager } from './main';

// Type definitions for IPC events
interface AnalyzeRecordingParams {
  recordingData: string;
  context?: string;
}

interface DecideParams {
  instruction: string;
  context?: string;
  parameters?: Record<string, any>;
}

interface QueryParams {
  query: string;
  context?: string;
  searchScope?: string;
}

interface RunFlowParams {
  flowId: string;
  parameters?: Record<string, any>;
  context?: string;
}

interface ExecuteFlowParams {
  flowSpec: any;
  variables?: Record<string, any>;
}

interface SaveFlowParams {
  flowSpec: any;
  filePath?: string;
}

interface TabOperationParams {
  tabId?: string;
  url?: string;
}

/**
 * Register all IPC handlers for secure communication between main and renderer processes
 */
export function registerIpcHandlers(): void {
  // LLM: Analyze recording handler
  ipcMain.handle('llm:analyzeRecording', async (event: IpcMainInvokeEvent, params: AnalyzeRecordingParams) => {
    try {
      // Validate input
      if (!params.recordingData || typeof params.recordingData !== 'string') {
        throw new Error('Invalid recording data provided');
      }

      // Check API key is configured
      if (!isApiKeyConfigured()) {
        throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY environment variable.');
      }

      const result = await analyzeRecording({
        recordingData: params.recordingData,
        context: params.context
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('LLM analyze recording error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // LLM: Decide handler (Uses Opus 4.1 to decide act vs snippet)
  ipcMain.handle('llm:decide', async (event: IpcMainInvokeEvent, signals: any) => {
    try {
      // Check API key is configured
      if (!isApiKeyConfigured()) {
        throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY environment variable.');
      }

      // Use Opus 4.1 for decision making
      const result = await makeDecision(signals);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('LLM decide error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Magnitude: Act handler (ONLY uses Sonnet 4 for browser automation)
  ipcMain.handle('magnitude:act', async (event: IpcMainInvokeEvent, params: DecideParams) => {
    try {
      // Validate input
      if (!params.instruction || typeof params.instruction !== 'string') {
        throw new Error('Invalid instruction provided');
      }

      // Check API key is configured
      if (!isApiKeyConfigured()) {
        throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY environment variable.');
      }

      // Use Sonnet 4 ONLY for Magnitude act operations
      const context = params.context || "IPC request for browser automation";
      const action = {
        action: "custom",
        target: "IPC",
        value: params.instruction,
        description: params.instruction
      };
      const result = await executeMagnitudeAct(context, action);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Magnitude act error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Magnitude: Query handler (Uses Opus 4.1 for data extraction)
  ipcMain.handle('magnitude:query', async (event: IpcMainInvokeEvent, params: { content: string; goal: string }) => {
    try {
      // Check API key is configured
      if (!isApiKeyConfigured()) {
        throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY environment variable.');
      }

      // Use Opus 4.1 for query/extraction
      const result = await extractDataForMagnitudeQuery(params.content, params.goal);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Magnitude query error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // LLM: Query handler
  ipcMain.handle('llm:query', async (event: IpcMainInvokeEvent, params: QueryParams) => {
    try {
      // Validate input
      if (!params.query || typeof params.query !== 'string') {
        throw new Error('Invalid query provided');
      }

      // Check API key is configured
      if (!isApiKeyConfigured()) {
        throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY environment variable.');
      }

      const result = await processQuery({
        query: params.query,
        context: params.context,
        searchScope: params.searchScope
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('LLM query error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Flows: Run one flow handler
  ipcMain.handle('flows:runOne', async (event: IpcMainInvokeEvent, params: RunFlowParams) => {
    try {
      // Validate input
      if (!params.flowId || typeof params.flowId !== 'string') {
        throw new Error('Invalid flow ID provided');
      }

      // TODO: Implement actual flow execution logic
      // This is a placeholder that would integrate with your flow system
      const result = await executeFlow({
        flowId: params.flowId,
        parameters: params.parameters,
        context: params.context
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Flow execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Utility: Test API connection
  ipcMain.handle('llm:testConnection', async (event: IpcMainInvokeEvent) => {
    try {
      if (!isApiKeyConfigured()) {
        return {
          success: false,
          error: 'API key not configured'
        };
      }

      const isConnected = await testConnection();
      return {
        success: true,
        data: { connected: isConnected }
      };
    } catch (error) {
      console.error('API connection test error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Utility: Check API key status
  ipcMain.handle('llm:checkApiKey', async (event: IpcMainInvokeEvent) => {
    return {
      success: true,
      data: { configured: isApiKeyConfigured() }
    };
  });

  // Tab Management Operations
  // Note: TabManager already registers its own IPC handlers, but we provide
  // wrapper handlers here for consistency and additional error handling
  
  // Create new tab
  ipcMain.handle('create-tab', async (event: IpcMainInvokeEvent, url?: string) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      const tab = await tabManager.createTab(url || 'https://www.google.com');
      return {
        success: true,
        data: tab
      };
    } catch (error) {
      console.error('Create tab error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Close tab
  ipcMain.handle('close-tab', async (event: IpcMainInvokeEvent, tabId: string) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      if (!tabId || typeof tabId !== 'string') {
        throw new Error('Invalid tab ID provided');
      }

      const result = await tabManager.closeTab(tabId);
      return {
        success: true,
        data: { closed: result }
      };
    } catch (error) {
      console.error('Close tab error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Switch tab
  ipcMain.handle('switch-tab', async (event: IpcMainInvokeEvent, tabId: string) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      if (!tabId || typeof tabId !== 'string') {
        throw new Error('Invalid tab ID provided');
      }

      const result = await tabManager.switchTab(tabId);
      return {
        success: true,
        data: { switched: result }
      };
    } catch (error) {
      console.error('Switch tab error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Navigate tab
  ipcMain.handle('navigate-tab', async (event: IpcMainInvokeEvent, tabId: string, url: string) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      if (!tabId || typeof tabId !== 'string') {
        throw new Error('Invalid tab ID provided');
      }

      if (!url || typeof url !== 'string') {
        throw new Error('Invalid URL provided');
      }

      const result = await tabManager.navigateTab(tabId, url);
      return {
        success: true,
        data: { navigated: result }
      };
    } catch (error) {
      console.error('Navigate tab error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Tab back navigation
  ipcMain.handle('tab-back', async (event: IpcMainInvokeEvent, tabId?: string) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      // If no tabId provided, use active tab
      const targetTabId = tabId || tabManager.getActiveTab()?.id;
      if (!targetTabId) {
        throw new Error('No tab ID provided and no active tab found');
      }

      const result = await tabManager.goBack(targetTabId);
      return {
        success: true,
        data: { wentBack: result }
      };
    } catch (error) {
      console.error('Tab back error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Tab forward navigation
  ipcMain.handle('tab-forward', async (event: IpcMainInvokeEvent, tabId?: string) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      // If no tabId provided, use active tab
      const targetTabId = tabId || tabManager.getActiveTab()?.id;
      if (!targetTabId) {
        throw new Error('No tab ID provided and no active tab found');
      }

      const result = await tabManager.goForward(targetTabId);
      return {
        success: true,
        data: { wentForward: result }
      };
    } catch (error) {
      console.error('Tab forward error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Tab reload
  ipcMain.handle('tab-reload', async (event: IpcMainInvokeEvent, tabId?: string) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      // If no tabId provided, use active tab
      const targetTabId = tabId || tabManager.getActiveTab()?.id;
      if (!targetTabId) {
        throw new Error('No tab ID provided and no active tab found');
      }

      const result = await tabManager.reloadTab(targetTabId);
      return {
        success: true,
        data: { reloaded: result }
      };
    } catch (error) {
      console.error('Tab reload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Recording: Start recording
  ipcMain.handle('start-recording', async (event: IpcMainInvokeEvent) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      const result = await tabManager.startRecording();
      return {
        success: result.success,
        data: result.success ? { sessionId: result.sessionId } : undefined,
        error: result.error
      };
    } catch (error) {
      console.error('Start recording error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Recording: Stop recording
  ipcMain.handle('stop-recording', async (event: IpcMainInvokeEvent) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      const result = tabManager.stopRecording();
      return {
        success: result.success,
        data: result.success ? { session: result.session } : undefined,
        error: result.error
      };
    } catch (error) {
      console.error('Stop recording error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Recording: Get recording status
  ipcMain.handle('recording-status', async (event: IpcMainInvokeEvent) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      const status = tabManager.getRecordingStatus();
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error('Get recording status error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Recording: Process recorded action from injected script
  ipcMain.handle('record-action', async (event: IpcMainInvokeEvent, action: any) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      const result = tabManager.processRecordedAction(action);
      return {
        success: result,
        error: result ? undefined : 'Failed to process recorded action'
      };
    } catch (error) {
      console.error('Process recorded action error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Recording: Generate Playwright code from session
  ipcMain.handle('generate-playwright-code', async (event: IpcMainInvokeEvent, session: any) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      if (!session) {
        throw new Error('No session data provided');
      }

      const code = tabManager.generatePlaywrightCode(session);
      return {
        success: true,
        data: { code }
      };
    } catch (error) {
      console.error('Generate Playwright code error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Recording: Export session as JSON
  ipcMain.handle('export-recording-session', async (event: IpcMainInvokeEvent, session: any) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      if (!session) {
        throw new Error('No session data provided');
      }

      const jsonData = tabManager.exportRecordingSession(session);
      return {
        success: true,
        data: { jsonData }
      };
    } catch (error) {
      console.error('Export recording session error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Recording: Import session from JSON
  ipcMain.handle('import-recording-session', async (event: IpcMainInvokeEvent, jsonData: string) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      if (!jsonData || typeof jsonData !== 'string') {
        throw new Error('Invalid JSON data provided');
      }

      const session = tabManager.importRecordingSession(jsonData);
      return {
        success: !!session,
        data: session ? { session } : undefined,
        error: session ? undefined : 'Failed to import session data'
      };
    } catch (error) {
      console.error('Import recording session error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Codegen Recording: Start codegen recording
  ipcMain.handle('start-codegen-recording', async (event: IpcMainInvokeEvent) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      const result = await tabManager.startCodegenRecording();
      return {
        success: result.success,
        data: result.success ? { sessionId: result.sessionId } : undefined,
        error: result.error
      };
    } catch (error) {
      console.error('Start codegen recording error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Codegen Recording: Stop codegen recording
  ipcMain.handle('stop-codegen-recording', async (event: IpcMainInvokeEvent) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      const result = await tabManager.stopCodegenRecording();
      return {
        success: result.success,
        data: result.success ? { 
          result: result.result,
          specFilePath: result.result?.session.specFilePath,
          screenshotPath: result.result?.session.screenshotPath,
          metadataPath: result.result?.session.metadataPath
        } : undefined,
        error: result.error
      };
    } catch (error) {
      console.error('Stop codegen recording error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Codegen Recording: Get codegen recording status
  ipcMain.handle('codegen-recording-status', async (event: IpcMainInvokeEvent) => {
    try {
      const tabManager = getTabManager();
      if (!tabManager) {
        throw new Error('TabManager not initialized');
      }

      const status = tabManager.getCodegenRecordingStatus();
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error('Get codegen recording status error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Execute flow handler
  ipcMain.handle('execute-flow', async (event: IpcMainInvokeEvent, params: ExecuteFlowParams) => {
    try {
      // Validate input
      if (!params.flowSpec) {
        throw new Error('Flow specification is required');
      }

      // Check API key is configured
      if (!isApiKeyConfigured()) {
        throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY environment variable.');
      }

      // For now, delegate to the Magnitude act system
      // In a full implementation, this would execute the flow steps directly
      const result = await executeFlowSteps(params.flowSpec, params.variables);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Execute flow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Save flow handler
  ipcMain.handle('save-flow', async (event: IpcMainInvokeEvent, params: SaveFlowParams) => {
    try {
      // Validate input
      if (!params.flowSpec) {
        throw new Error('Flow specification is required');
      }

      const result = await saveFlowToFile(params.flowSpec, params.filePath);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Save flow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  console.log('IPC handlers registered successfully');
}

// Placeholder function for flow execution
// This should be replaced with actual flow execution logic
async function executeFlow(params: RunFlowParams): Promise<any> {
  // This is a placeholder implementation
  // In a real implementation, this would:
  // 1. Load the flow definition by flowId
  // 2. Execute the flow steps
  // 3. Handle flow state and error recovery
  // 4. Return the flow execution result
  
  return {
    flowId: params.flowId,
    status: 'completed',
    result: 'Flow execution placeholder - implement actual flow logic',
    executionTime: Date.now(),
    parameters: params.parameters
  };
}

/**
 * Execute flow steps using Magnitude Act system
 */
async function executeFlowSteps(flowSpec: any, variables?: Record<string, any>): Promise<any> {
  try {
    console.log('Executing flow:', flowSpec.name || 'Unnamed Flow');
    
    if (!flowSpec.steps || !Array.isArray(flowSpec.steps)) {
      throw new Error('Flow must have valid steps array');
    }

    const results = [];
    for (let i = 0; i < flowSpec.steps.length; i++) {
      const step = flowSpec.steps[i];
      console.log(`Executing step ${i + 1}/${flowSpec.steps.length}:`, step.action);
      
      // Convert step to Magnitude instruction
      const instruction = formatStepForMagnitude(step, variables);
      
      // Execute via Magnitude Act
      const context = `Step ${i + 1} of flow: ${flowSpec.name || 'Unnamed Flow'}`;
      const stepResult = await executeMagnitudeAct(context, step);
      
      results.push({
        stepIndex: i,
        step: step,
        result: stepResult,
        timestamp: Date.now()
      });
      
      // Add delay between steps to avoid overwhelming the system
      if (i < flowSpec.steps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return {
      flowId: flowSpec.id || 'generated',
      flowName: flowSpec.name || 'Unnamed Flow',
      status: 'completed',
      stepsExecuted: results.length,
      totalSteps: flowSpec.steps.length,
      results: results,
      executionTime: Date.now(),
      variables: variables
    };
    
  } catch (error) {
    console.error('Flow execution error:', error);
    throw error;
  }
}

/**
 * Format a flow step for Magnitude Act execution
 */
function formatStepForMagnitude(step: any, variables?: Record<string, any>): string {
  const action = step.action || 'unknown';
  const target = step.target || '';
  const value = step.value || '';
  
  // Substitute variables in target and value
  const substitutedTarget = substituteVariables(target, variables);
  const substitutedValue = substituteVariables(value, variables);
  
  switch (action.toLowerCase()) {
    case 'click':
      return `Click on the element: ${substitutedTarget}`;
    case 'type':
      return `Type "${substitutedValue}" into the element: ${substitutedTarget}`;
    case 'navigate':
      return `Navigate to URL: ${substitutedTarget || substitutedValue}`;
    case 'wait':
      return `Wait for ${substitutedTarget || substitutedValue || '1000'} milliseconds`;
    case 'scroll':
      return `Scroll ${substitutedTarget || 'down'} on the page`;
    case 'hover':
      return `Hover over the element: ${substitutedTarget}`;
    case 'select':
      return `Select "${substitutedValue}" from the dropdown: ${substitutedTarget}`;
    case 'submit':
      return `Submit the form: ${substitutedTarget}`;
    default:
      return `Perform ${action} action on ${substitutedTarget}${substitutedValue ? ` with value: ${substitutedValue}` : ''}`;
  }
}

/**
 * Substitute variables in a string using {{variable}} syntax
 */
function substituteVariables(text: string, variables?: Record<string, any>): string {
  if (!text || typeof text !== 'string' || !variables) {
    return text;
  }
  
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, String(value || ''));
  }
  
  return result;
}

/**
 * Save flow specification to file
 */
async function saveFlowToFile(flowSpec: any, filePath?: string): Promise<any> {
  const fs = require('fs').promises;
  const path = require('path');
  const { dialog } = require('electron');
  
  try {
    let targetPath = filePath;
    
    if (!targetPath) {
      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Save Flow',
        defaultPath: `${flowSpec.name || 'flow'}.json`,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (result.canceled || !result.filePath) {
        throw new Error('Save operation cancelled');
      }
      
      targetPath = result.filePath;
    }
    
    // Ensure the directory exists
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Add metadata to the flow
    const flowWithMetadata = {
      ...flowSpec,
      savedAt: new Date().toISOString(),
      version: '1.0',
      type: 'cua-flow'
    };
    
    // Write the file
    await fs.writeFile(targetPath, JSON.stringify(flowWithMetadata, null, 2), 'utf8');
    
    console.log('Flow saved to:', targetPath);
    
    return {
      filePath: targetPath,
      size: JSON.stringify(flowWithMetadata).length,
      savedAt: flowWithMetadata.savedAt
    };
    
  } catch (error) {
    console.error('Error saving flow:', error);
    throw error;
  }
}

/**
 * Remove all IPC handlers (useful for cleanup)
 */
export function removeIpcHandlers(): void {
  ipcMain.removeAllListeners('llm:analyzeRecording');
  ipcMain.removeAllListeners('llm:decide');
  ipcMain.removeAllListeners('llm:query');
  ipcMain.removeAllListeners('magnitude:act');
  ipcMain.removeAllListeners('magnitude:query');
  ipcMain.removeAllListeners('flows:runOne');
  ipcMain.removeAllListeners('llm:testConnection');
  ipcMain.removeAllListeners('llm:checkApiKey');
  
  // Tab management handlers
  ipcMain.removeAllListeners('create-tab');
  ipcMain.removeAllListeners('close-tab');
  ipcMain.removeAllListeners('switch-tab');
  ipcMain.removeAllListeners('navigate-tab');
  ipcMain.removeAllListeners('tab-back');
  ipcMain.removeAllListeners('tab-forward');
  ipcMain.removeAllListeners('tab-reload');
  
  // Recording handlers
  ipcMain.removeAllListeners('start-recording');
  ipcMain.removeAllListeners('stop-recording');
  ipcMain.removeAllListeners('recording-status');
  ipcMain.removeAllListeners('record-action');
  ipcMain.removeAllListeners('generate-playwright-code');
  ipcMain.removeAllListeners('export-recording-session');
  ipcMain.removeAllListeners('import-recording-session');
  
  // Codegen recording handlers
  ipcMain.removeAllListeners('start-codegen-recording');
  ipcMain.removeAllListeners('stop-codegen-recording');
  ipcMain.removeAllListeners('codegen-recording-status');
  
  // Flow execution handlers
  ipcMain.removeAllListeners('execute-flow');
  ipcMain.removeAllListeners('save-flow');
  
  console.log('IPC handlers removed');
}