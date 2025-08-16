const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// a limited set of Electron APIs without exposing the entire API
contextBridge.exposeInMainWorld('electronAPI', {
  // Tab management - using both direct TabManager channels and wrapper handlers
  createTab: (url) => ipcRenderer.invoke('create-tab', url),
  closeTab: (tabId) => ipcRenderer.invoke('close-tab', tabId),
  switchTab: (tabId) => ipcRenderer.invoke('switch-tab', tabId),
  navigateTab: (tabId, url) => ipcRenderer.invoke('navigate-tab', tabId, url),
  goBack: (tabId) => ipcRenderer.invoke('tab-back', tabId),
  goForward: (tabId) => ipcRenderer.invoke('tab-forward', tabId),
  reloadTab: (tabId) => ipcRenderer.invoke('tab-reload', tabId),
  
  // Direct TabManager methods (these work directly with TabManager)
  getAllTabs: () => ipcRenderer.invoke('tabs:getAll'),
  getActiveTab: () => ipcRenderer.invoke('tabs:getActive'),
  
  // Convenience methods for current tab navigation (no tabId required)
  goBackCurrent: () => ipcRenderer.invoke('tab-back'),
  goForwardCurrent: () => ipcRenderer.invoke('tab-forward'),
  reloadCurrent: () => ipcRenderer.invoke('tab-reload'),

  // LLM operations
  analyzeRecording: (recording) => ipcRenderer.invoke('llm:analyzeRecording', recording),
  makeDecision: (signals) => ipcRenderer.invoke('llm:decide', signals),
  executeMagnitudeAct: (params) => ipcRenderer.invoke('magnitude:act', params),
  executeMagnitudeQuery: (params) => ipcRenderer.invoke('magnitude:query', params),
  processQuery: (params) => ipcRenderer.invoke('llm:query', params),

  // Flow operations
  runFlow: (params) => ipcRenderer.invoke('flows:runOne', params),
  executeFlow: (flowSpec, variables) => ipcRenderer.invoke('execute-flow', { flowSpec, variables }),
  saveFlow: (flowSpec, filePath) => ipcRenderer.invoke('save-flow', { flowSpec, filePath }),

  // Flow events
  onFlowProgress: (callback) => ipcRenderer.on('flow-progress', (event, progress) => callback(progress)),
  onFlowComplete: (callback) => ipcRenderer.on('flow-complete', (event, result) => callback(result)),
  onRecordingComplete: (callback) => ipcRenderer.on('recording-complete', (event, intentSpec) => callback(intentSpec)),

  // Recording operations
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  getRecordingStatus: () => ipcRenderer.invoke('recording-status'),
  // Codegen recording (Playwright-based) - NEW
  startCodegenRecording: () => ipcRenderer.invoke('start-codegen-recording'),
  stopCodegenRecording: () => ipcRenderer.invoke('stop-codegen-recording'),
  getCodegenRecordingStatus: () => ipcRenderer.invoke('codegen-recording-status'),
  recordAction: (action) => ipcRenderer.invoke('record-action', action),
  generatePlaywrightCode: (session) => ipcRenderer.invoke('generate-playwright-code', session),
  exportRecordingSession: (session) => ipcRenderer.invoke('export-recording-session', session),
  importRecordingSession: (jsonData) => ipcRenderer.invoke('import-recording-session', jsonData),
  onRecordingComplete: (callback) => {
    // Set up callback for recording completion
    window.addEventListener('recordingComplete', (event) => callback(event.detail));
  },

  // WebView2 bridge events - from main to renderer
  onCreateWebview: (callback) => ipcRenderer.on('create-webview', (event, data) => callback(data)),
  onRemoveWebview: (callback) => ipcRenderer.on('remove-webview', (event, webviewId) => callback(webviewId)),
  onSwitchWebview: (callback) => ipcRenderer.on('switch-webview', (event, webviewId) => callback(webviewId)),
  onNavigateWebview: (callback) => ipcRenderer.on('navigate-webview', (event, webviewId, url) => callback(webviewId, url)),
  onWebviewGoBack: (callback) => ipcRenderer.on('webview-goback', (event, webviewId) => callback(webviewId)),
  onWebviewGoForward: (callback) => ipcRenderer.on('webview-goforward', (event, webviewId) => callback(webviewId)),
  onWebviewReload: (callback) => ipcRenderer.on('webview-reload', (event, webviewId) => callback(webviewId)),
  onTabsUpdated: (callback) => ipcRenderer.on('tabs-updated', (event, data) => callback(data)),
  onNavigationUpdate: (callback) => ipcRenderer.on('navigation-update', (event, data) => callback(data)),
  onTabTitleUpdate: (callback) => ipcRenderer.on('tab-title-update', (event, tabId, title) => callback(tabId, title)),
  onTabUrlUpdate: (callback) => ipcRenderer.on('tab-url-update', (event, tabId, url) => callback(tabId, url)),
  
  // Remove tab update listeners
  removeTabsUpdatedListener: (callback) => ipcRenderer.removeListener('tabs-updated', callback),
  removeAllTabsUpdatedListeners: () => ipcRenderer.removeAllListeners('tabs-updated'),

  // Remove flow event listeners
  removeFlowProgressListener: (callback) => ipcRenderer.removeListener('flow-progress', callback),
  removeFlowCompleteListener: (callback) => ipcRenderer.removeListener('flow-complete', callback),
  removeRecordingCompleteListener: (callback) => ipcRenderer.removeListener('recording-complete', callback),
  removeAllFlowListeners: () => {
    ipcRenderer.removeAllListeners('flow-progress');
    ipcRenderer.removeAllListeners('flow-complete');
    ipcRenderer.removeAllListeners('recording-complete');
  },

  // WebView2 bridge events - from renderer to main
  sendWebviewTitleUpdate: (tabId, title) => ipcRenderer.send('webview:titleUpdated', tabId, title),
  sendWebviewUrlChange: (tabId, url) => ipcRenderer.send('webview:urlChanged', tabId, url),
  sendWebviewLoadingChange: (tabId, isLoading) => ipcRenderer.send('webview:loadingChanged', tabId, isLoading),
  sendWebviewNavigationState: (tabId, canGoBack, canGoForward) => ipcRenderer.send('webview:navigationStateChanged', tabId, canGoBack, canGoForward),
  sendWebviewNewWindow: (tabId, url) => ipcRenderer.send('webview:newWindowRequested', tabId, url),

  // Utility
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  
  // Platform info
  platform: process.platform,
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux'
});

// Log that preload script is loaded
console.log('Preload script loaded successfully');