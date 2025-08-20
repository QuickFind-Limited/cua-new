import { EventEmitter } from 'events';
import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// WebView2 interfaces for Windows
interface WebView2Tab {
  id: string;
  url: string;
  title: string;
  webviewId: string;
  isActive: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

interface TabManagerOptions {
  window: BrowserWindow;
  preloadPath?: string;
}

/**
 * TabManager for WebView2 multi-tab browsing on Windows
 * Each tab is a WebView2 instance embedded in the Electron window
 */
export class TabManager extends EventEmitter {
  private tabs: Map<string, WebView2Tab> = new Map();
  private activeTabId: string | null = null;
  private window: BrowserWindow;
  private preloadPath: string;

  constructor(options: TabManagerOptions) {
    super();
    this.window = options.window;
    this.preloadPath = options.preloadPath || path.join(__dirname, '..', 'preload.js');
    this.setupIpcHandlers();
  }

  /**
   * Setup IPC handlers for tab management
   */
  private setupIpcHandlers(): void {
    // Tab creation
    ipcMain.handle('tabs:create', async (event, url?: string) => {
      return this.createTab(url || 'https://www.google.com');
    });

    // Tab closing
    ipcMain.handle('tabs:close', async (event, tabId: string) => {
      return this.closeTab(tabId);
    });

    // Tab switching
    ipcMain.handle('tabs:switch', async (event, tabId: string) => {
      return this.switchTab(tabId);
    });

    // Navigation
    ipcMain.handle('tabs:navigate', async (event, tabId: string, url: string) => {
      return this.navigateTab(tabId, url);
    });

    ipcMain.handle('tabs:goBack', async (event, tabId: string) => {
      return this.goBack(tabId);
    });

    ipcMain.handle('tabs:goForward', async (event, tabId: string) => {
      return this.goForward(tabId);
    });

    ipcMain.handle('tabs:reload', async (event, tabId: string) => {
      return this.reloadTab(tabId);
    });

    // Get all tabs
    ipcMain.handle('tabs:getAll', async () => {
      return Array.from(this.tabs.values());
    });

    // Get active tab
    ipcMain.handle('tabs:getActive', async () => {
      return this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    });

    // Handle WebView2 events from renderer
    ipcMain.on('webview:titleUpdated', (event, tabId: string, title: string) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.title = title;
        this.emit('tab-title-updated', tabId, title);
        this.sendTabUpdate();
      }
    });

    ipcMain.on('webview:urlChanged', (event, tabId: string, url: string) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.url = url;
        this.emit('tab-url-changed', tabId, url);
        this.sendTabUpdate();
      }
    });

    ipcMain.on('webview:loadingChanged', (event, tabId: string, isLoading: boolean) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.isLoading = isLoading;
        this.emit('tab-loading-changed', tabId, isLoading);
        this.sendTabUpdate();
      }
    });

    ipcMain.on('webview:navigationStateChanged', (event, tabId: string, canGoBack: boolean, canGoForward: boolean) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.canGoBack = canGoBack;
        tab.canGoForward = canGoForward;
        this.sendTabUpdate();
      }
    });

    // Handle new window requests (open in new tab)
    ipcMain.on('webview:newWindowRequested', (event, tabId: string, url: string) => {
      this.createTab(url);
    });
  }

  /**
   * Create a new WebView2 tab
   */
  public async createTab(url: string): Promise<WebView2Tab> {
    const tabId = uuidv4();
    const webviewId = `webview-${tabId}`;

    const tab: WebView2Tab = {
      id: tabId,
      url,
      title: 'New Tab',
      webviewId,
      isActive: false,
      canGoBack: false,
      canGoForward: false,
      isLoading: true
    };

    this.tabs.set(tabId, tab);

    // Send command to renderer to create WebView2 element
    this.window.webContents.send('create-webview', {
      tabId,
      webviewId,
      url,
      preloadPath: this.preloadPath
    });

    // If this is the first tab or no active tab, make it active
    if (this.tabs.size === 1 || !this.activeTabId) {
      await this.switchTab(tabId);
    }

    this.emit('tab-created', tab);
    this.sendTabUpdate();
    
    return tab;
  }

  /**
   * Close a tab
   */
  public async closeTab(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    // Send command to renderer to remove WebView2 element
    this.window.webContents.send('remove-webview', tab.webviewId);

    this.tabs.delete(tabId);

    // If this was the active tab, switch to another
    if (tabId === this.activeTabId) {
      const remainingTabs = Array.from(this.tabs.keys());
      if (remainingTabs.length > 0) {
        await this.switchTab(remainingTabs[0]);
      } else {
        this.activeTabId = null;
      }
    }

    this.emit('tab-closed', tabId);
    this.sendTabUpdate();
    
    return true;
  }

  /**
   * Switch to a different tab
   */
  public async switchTab(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    // Update active states
    this.tabs.forEach((t, id) => {
      t.isActive = (id === tabId);
    });

    this.activeTabId = tabId;

    // Send command to renderer to show this WebView2
    this.window.webContents.send('switch-webview', tab.webviewId);

    this.emit('tab-switched', tabId);
    this.sendTabUpdate();
    
    return true;
  }

  /**
   * Navigate a tab to a URL
   */
  public async navigateTab(tabId: string, url: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    tab.url = url;
    tab.isLoading = true;

    // Send navigation command to renderer
    this.window.webContents.send('navigate-webview', tab.webviewId, url);

    this.emit('tab-navigated', tabId, url);
    this.sendTabUpdate();
    
    return true;
  }

  /**
   * Go back in tab history
   */
  public async goBack(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.canGoBack) return false;

    this.window.webContents.send('webview-goback', tab.webviewId);
    return true;
  }

  /**
   * Go forward in tab history
   */
  public async goForward(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.canGoForward) return false;

    this.window.webContents.send('webview-goforward', tab.webviewId);
    return true;
  }

  /**
   * Reload a tab
   */
  public async reloadTab(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    tab.isLoading = true;
    this.window.webContents.send('webview-reload', tab.webviewId);
    
    this.sendTabUpdate();
    return true;
  }

  /**
   * Get all tabs
   */
  public getTabs(): WebView2Tab[] {
    return Array.from(this.tabs.values());
  }

  /**
   * Get active tab
   */
  public getActiveTab(): WebView2Tab | null {
    return this.activeTabId ? this.tabs.get(this.activeTabId) || null : null;
  }

  /**
   * Send tab update to renderer
   */
  private sendTabUpdate(): void {
    this.window.webContents.send('tabs-updated', {
      tabs: Array.from(this.tabs.values()),
      activeTabId: this.activeTabId
    });
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.tabs.clear();
    this.removeAllListeners();
  }
}