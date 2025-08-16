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

  // Recording operations
  startRecording: () => ipcRenderer.invoke('recording:start'),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  getRecording: () => ipcRenderer.invoke('recording:get'),

  // WebView2 bridge events - from main to renderer
  onCreateWebview: (callback) => ipcRenderer.on('create-webview', (event, data) => callback(data)),
  onRemoveWebview: (callback) => ipcRenderer.on('remove-webview', (event, webviewId) => callback(webviewId)),
  onSwitchWebview: (callback) => ipcRenderer.on('switch-webview', (event, webviewId) => callback(webviewId)),
  onNavigateWebview: (callback) => ipcRenderer.on('navigate-webview', (event, webviewId, url) => callback(webviewId, url)),
  onWebviewGoBack: (callback) => ipcRenderer.on('webview-goback', (event, webviewId) => callback(webviewId)),
  onWebviewGoForward: (callback) => ipcRenderer.on('webview-goforward', (event, webviewId) => callback(webviewId)),
  onWebviewReload: (callback) => ipcRenderer.on('webview-reload', (event, webviewId) => callback(webviewId)),
  onTabsUpdated: (callback) => ipcRenderer.on('tabs-updated', (event, data) => callback(data)),
  
  // Remove tab update listeners
  removeTabsUpdatedListener: (callback) => ipcRenderer.removeListener('tabs-updated', callback),
  removeAllTabsUpdatedListeners: () => ipcRenderer.removeAllListeners('tabs-updated'),

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