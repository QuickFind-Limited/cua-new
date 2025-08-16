import { EventEmitter } from 'events';
import { BrowserWindow, WebContentsView, ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';

// WebContentsView-based tab interface
interface WebContentsTab {
  id: string;
  url: string;
  title: string;
  view: WebContentsView;
  isActive: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

interface WebContentsTabManagerOptions {
  window: BrowserWindow;
  preloadPath?: string;
}

/**
 * WebContentsTabManager for Electron app using WebContentsView instances
 * Each tab is a WebContentsView that fills the content area below the UI chrome
 */
export class WebContentsTabManager extends EventEmitter {
  private tabs: Map<string, WebContentsTab> = new Map();
  private activeTabId: string | null = null;
  private window: BrowserWindow;
  private preloadPath: string;
  private readonly chromeHeight = 88; // Height of tab bar + nav bar

  constructor(options: WebContentsTabManagerOptions) {
    super();
    this.window = options.window;
    this.preloadPath = options.preloadPath || '';
    this.setupIpcHandlers();
    this.setupWindowListeners();
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
      return this.getTabsForRenderer();
    });

    // Get active tab
    ipcMain.handle('tabs:getActive', async () => {
      return this.activeTabId ? this.getTabForRenderer(this.activeTabId) : null;
    });
  }

  /**
   * Setup window listeners for resizing
   */
  private setupWindowListeners(): void {
    this.window.on('resize', () => {
      this.updateAllTabBounds();
    });
  }

  /**
   * Create a new WebContentsView tab
   * Returns a serializable tab info (without the view object)
   */
  public async createTab(url: string): Promise<Omit<WebContentsTab, 'view'>> {
    const tabId = uuidv4();

    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Create WebContentsView
    const view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    const tab: WebContentsTab = {
      id: tabId,
      url,
      title: 'New Tab',
      view,
      isActive: false,
      canGoBack: false,
      canGoForward: false,
      isLoading: true
    };

    // Setup WebContents event handlers
    this.setupWebContentsHandlers(tab);

    // Add view to window (initially hidden)
    this.window.contentView.addChildView(view);
    
    // Position the view
    this.updateTabBounds(tab);
    
    // Hide the view initially
    view.setVisible(false);

    this.tabs.set(tabId, tab);

    // Load the URL
    view.webContents.loadURL(url);

    // If this is the first tab or no active tab, make it active
    if (this.tabs.size === 1 || !this.activeTabId) {
      await this.switchTab(tabId);
    }

    this.emit('tab-created', this.getTabForRenderer(tabId));
    this.sendTabUpdate();
    
    // Return serializable tab info (without view)
    const { view: tabView, ...tabInfo } = tab;
    return tabInfo;
  }

  /**
   * Close a tab
   */
  public async closeTab(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    // Remove view from window (this will also clean up the WebContents)
    this.window.contentView.removeChildView(tab.view);

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

    // Hide all other tabs
    this.tabs.forEach((t, id) => {
      t.isActive = (id === tabId);
      t.view.setVisible(id === tabId);
    });

    this.activeTabId = tabId;

    // Update bounds for the active tab
    this.updateTabBounds(tab);

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

    // Navigate the WebContents
    tab.view.webContents.loadURL(url);

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

    tab.view.webContents.goBack();
    return true;
  }

  /**
   * Go forward in tab history
   */
  public async goForward(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.canGoForward) return false;

    tab.view.webContents.goForward();
    return true;
  }

  /**
   * Reload a tab
   */
  public async reloadTab(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    tab.isLoading = true;
    tab.view.webContents.reload();
    
    this.sendTabUpdate();
    return true;
  }

  /**
   * Get all tabs (for renderer)
   */
  public getTabs(): any[] {
    return this.getTabsForRenderer();
  }

  /**
   * Get active tab (for renderer)
   */
  public getActiveTab(): any | null {
    return this.activeTabId ? this.getTabForRenderer(this.activeTabId) : null;
  }

  /**
   * Setup WebContents event handlers for a tab
   */
  private setupWebContentsHandlers(tab: WebContentsTab): void {
    const webContents = tab.view.webContents;

    // Page title updated
    webContents.on('page-title-updated', (event, title) => {
      tab.title = title;
      this.emit('tab-title-updated', tab.id, title);
      this.sendTabUpdate();
    });

    // Navigation completed
    webContents.on('did-finish-load', () => {
      tab.isLoading = false;
      tab.canGoBack = webContents.canGoBack();
      tab.canGoForward = webContents.canGoForward();
      this.sendTabUpdate();
    });

    // Navigation started
    webContents.on('did-start-loading', () => {
      tab.isLoading = true;
      this.sendTabUpdate();
    });

    // URL changed
    webContents.on('did-navigate', (event, url) => {
      tab.url = url;
      tab.canGoBack = webContents.canGoBack();
      tab.canGoForward = webContents.canGoForward();
      this.emit('tab-url-changed', tab.id, url);
      this.sendTabUpdate();
    });

    // In-page navigation (for SPAs)
    webContents.on('did-navigate-in-page', (event, url) => {
      tab.url = url;
      this.emit('tab-url-changed', tab.id, url);
      this.sendTabUpdate();
    });

    // Handle new window requests (open in new tab)
    webContents.setWindowOpenHandler(({ url }) => {
      this.createTab(url);
      return { action: 'deny' };
    });

    // Handle failed loads
    webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      tab.isLoading = false;
      console.error(`Failed to load ${validatedURL}: ${errorDescription}`);
      this.sendTabUpdate();
    });
  }

  /**
   * Update bounds for a specific tab
   */
  private updateTabBounds(tab: WebContentsTab): void {
    const bounds = this.window.getBounds();
    const [width, height] = this.window.getContentSize();
    
    tab.view.setBounds({
      x: 0,
      y: this.chromeHeight, // Below tab bar and nav bar
      width: width,
      height: height - this.chromeHeight
    });
  }

  /**
   * Update bounds for all tabs
   */
  private updateAllTabBounds(): void {
    this.tabs.forEach(tab => {
      this.updateTabBounds(tab);
    });
  }

  /**
   * Get tab data suitable for renderer process
   */
  private getTabForRenderer(tabId: string): any | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;

    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      isActive: tab.isActive,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      isLoading: tab.isLoading
    };
  }

  /**
   * Get all tabs data suitable for renderer process
   */
  private getTabsForRenderer(): any[] {
    return Array.from(this.tabs.values()).map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      isActive: tab.isActive,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      isLoading: tab.isLoading
    }));
  }

  /**
   * Send tab update to renderer
   */
  private sendTabUpdate(): void {
    this.window.webContents.send('tabs-updated', {
      tabs: this.getTabsForRenderer(),
      activeTabId: this.activeTabId
    });
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    try {
      // Close all tabs
      this.tabs.forEach((tab, tabId) => {
        try {
          // Check if window and view still exist before removing
          if (this.window && !this.window.isDestroyed() && tab.view) {
            this.window.contentView.removeChildView(tab.view);
          }
        } catch (e) {
          // View might already be destroyed, ignore
        }
      });

      this.tabs.clear();
      this.removeAllListeners();
    } catch (error) {
      // Ignore errors during disposal
      console.log('Error during TabManager disposal (safe to ignore):', error);
    }
  }
}