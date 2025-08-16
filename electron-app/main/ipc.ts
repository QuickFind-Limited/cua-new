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
      const result = await executeMagnitudeAct({
        instruction: params.instruction,
        context: params.context,
        parameters: params.parameters
      });

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
  
  console.log('IPC handlers removed');
}