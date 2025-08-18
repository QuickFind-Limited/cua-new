import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import { PlaywrightWindowsRecorder } from './playwright-windows-recorder';
import { WebContentsTabManager } from './WebContentsTabManager';

/**
 * Recorder Integration for Windows Native Embedding
 * Manages the transition between WebContentsView and embedded Playwright
 */
export class RecorderIntegration {
  private mainWindow: BrowserWindow;
  private tabManager: WebContentsTabManager;
  private windowsRecorder: PlaywrightWindowsRecorder;
  private hiddenViews: Map<string, WebContentsView> = new Map();
  private isRecording = false;
  private activeTabIdBeforeRecording: string | null = null;

  constructor(mainWindow: BrowserWindow, tabManager: WebContentsTabManager) {
    this.mainWindow = mainWindow;
    this.tabManager = tabManager;
    this.windowsRecorder = new PlaywrightWindowsRecorder(mainWindow);
    this.setupIpcHandlers();
  }

  private setupIpcHandlers(): void {
    // Handle recording start from UI
    ipcMain.handle('recorder:start-windows', async (event, options: {
      sessionId?: string;
      startUrl?: string;
      useCurrentTab?: boolean;
    }) => {
      return await this.startWindowsRecording(options);
    });

    // Handle recording stop from UI
    ipcMain.handle('recorder:stop-windows', async () => {
      return await this.stopWindowsRecording();
    });

    // Get recording status
    ipcMain.handle('recorder:status', async () => {
      return this.windowsRecorder.getRecordingStatus();
    });

    // Handle messages from WindowsRecorder
    ipcMain.on('hide-webview-for-recording', () => {
      this.hideCurrentWebContentsView();
    });

    ipcMain.on('show-webview-after-recording', () => {
      this.restoreWebContentsView();
    });
  }

  /**
   * Start Windows-native embedded recording
   */
  public async startWindowsRecording(options: {
    sessionId?: string;
    startUrl?: string;
    useCurrentTab?: boolean;
  }): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Recording already in progress');
      return false;
    }

    try {
      // Generate session ID if not provided
      const sessionId = options.sessionId || `windows-${Date.now()}`;
      
      // Determine starting URL
      let startUrl = options.startUrl;
      if (options.useCurrentTab && !startUrl) {
        // Get current tab's URL
        const activeTab = await this.tabManager.getActiveTab();
        if (activeTab) {
          startUrl = activeTab.url;
        }
      }
      startUrl = startUrl || 'https://www.google.com';

      // Store current state
      this.activeTabIdBeforeRecording = await this.tabManager.getActiveTabId();
      
      // Hide all WebContentsViews
      await this.hideAllWebContentsViews();
      
      // Start Windows-embedded recording
      const success = await this.windowsRecorder.startRecording(sessionId, startUrl);
      
      if (success) {
        this.isRecording = true;
        
        // Notify UI that recording started
        this.mainWindow.webContents.send('recording-started', {
          sessionId,
          mode: 'windows-native',
          startUrl
        });
        
        // Update sidebar UI
        this.mainWindow.webContents.send('update-sidebar-progress', {
          step: 'recording',
          status: 'active'
        });
      } else {
        // Restore views if recording failed to start
        await this.restoreWebContentsView();
      }
      
      return success;
      
    } catch (error) {
      console.error('Failed to start Windows recording:', error);
      await this.restoreWebContentsView();
      return false;
    }
  }

  /**
   * Stop Windows-native embedded recording
   */
  public async stopWindowsRecording(): Promise<any> {
    if (!this.isRecording) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      // Stop recording and get results
      const result = await this.windowsRecorder.stopRecording();
      
      // Restore WebContentsViews
      await this.restoreWebContentsView();
      
      this.isRecording = false;
      
      // Notify UI that recording stopped
      if (result) {
        this.mainWindow.webContents.send('recording-stopped', {
          ...result,
          mode: 'windows-native'
        });
        
        // Update sidebar UI
        this.mainWindow.webContents.send('update-sidebar-progress', {
          step: 'recording',
          status: 'completed'
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('Failed to stop Windows recording:', error);
      await this.restoreWebContentsView();
      this.isRecording = false;
      return null;
    }
  }

  /**
   * Hide all WebContentsViews during recording
   */
  private async hideAllWebContentsViews(): Promise<void> {
    console.log('Hiding all WebContentsViews for recording');
    
    // Get all tabs from tab manager
    const tabs = this.tabManager.getAllTabs();
    
    for (const tab of tabs) {
      if (tab.view) {
        // Store reference to view
        this.hiddenViews.set(tab.id, tab.view);
        
        // Remove view from window
        this.mainWindow.contentView.removeChildView(tab.view);
      }
    }
    
    // Notify UI that webviews are hidden
    this.mainWindow.webContents.send('webviews-hidden');
  }

  /**
   * Hide only the current WebContentsView
   */
  private hideCurrentWebContentsView(): void {
    const activeTab = this.tabManager.getActiveTabSync();
    if (activeTab && activeTab.view) {
      console.log('Hiding active WebContentsView:', activeTab.id);
      
      // Store and remove view
      this.hiddenViews.set(activeTab.id, activeTab.view);
      this.mainWindow.contentView.removeChildView(activeTab.view);
    }
  }

  /**
   * Restore WebContentsViews after recording
   */
  private async restoreWebContentsView(): Promise<void> {
    console.log('Restoring WebContentsViews after recording');
    
    // Restore hidden views
    for (const [tabId, view] of this.hiddenViews) {
      // Add view back to window
      this.mainWindow.contentView.addChildView(view);
      
      // Update bounds based on current sidebar state
      const bounds = this.calculateWebViewBounds();
      view.setBounds(bounds);
    }
    
    // Clear hidden views map
    this.hiddenViews.clear();
    
    // Restore active tab if we had one
    if (this.activeTabIdBeforeRecording) {
      await this.tabManager.switchTab(this.activeTabIdBeforeRecording);
      this.activeTabIdBeforeRecording = null;
    }
    
    // Notify UI that webviews are restored
    this.mainWindow.webContents.send('webviews-restored');
  }

  /**
   * Calculate bounds for WebContentsView
   */
  private calculateWebViewBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const windowBounds = this.mainWindow.getContentBounds();
    const sidebarWidth = 320; // From your CSS
    const tabbarHeight = 40;   // From your layout
    
    return {
      x: sidebarWidth,
      y: tabbarHeight,
      width: windowBounds.width - sidebarWidth,
      height: windowBounds.height - tabbarHeight
    };
  }

  /**
   * Check if recording is active
   */
  public isRecordingActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get current recording status
   */
  public getRecordingStatus(): any {
    return {
      isRecording: this.isRecording,
      mode: this.isRecording ? 'windows-native' : null,
      ...this.windowsRecorder.getRecordingStatus()
    };
  }

  /**
   * Clean up resources
   */
  public async dispose(): Promise<void> {
    if (this.isRecording) {
      await this.stopWindowsRecording();
    }
    await this.windowsRecorder.dispose();
  }
}

/**
 * Extension to WebContentsTabManager for recording integration
 */
export interface ExtendedWebContentsTabManager extends WebContentsTabManager {
  getAllTabs(): any[];
  getActiveTabSync(): any;
  getActiveTabId(): Promise<string | null>;
}