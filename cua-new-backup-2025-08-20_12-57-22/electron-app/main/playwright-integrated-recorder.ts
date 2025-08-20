import { BrowserWindow, ipcMain, screen } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Integrated Playwright Recorder
 * Launches Playwright browser in a frameless window that appears integrated with Electron
 */
export class PlaywrightIntegratedRecorder {
  private electronWindow: BrowserWindow;
  private playwrightBrowser: Browser | null = null;
  private playwrightContext: BrowserContext | null = null;
  private playwrightPage: Page | null = null;
  private isRecording = false;
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private windowBounds: { x: number; y: number; width: number; height: number } | null = null;

  constructor(electronWindow: BrowserWindow) {
    this.electronWindow = electronWindow;
    this.setupWindowTracking();
    this.ensureRecordingsDirectory();
  }

  private async ensureRecordingsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.recordingsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create recordings directory:', error);
    }
  }

  /**
   * Track Electron window position and size for synchronization
   */
  private setupWindowTracking(): void {
    // Track window movement
    this.electronWindow.on('move', () => {
      this.syncPlaywrightWindowPosition();
    });

    // Track window resize
    this.electronWindow.on('resize', () => {
      this.syncPlaywrightWindowPosition();
    });

    // Track window focus
    this.electronWindow.on('focus', () => {
      this.focusPlaywrightWindow();
    });

    // Track minimize/restore
    this.electronWindow.on('minimize', () => {
      this.hidePlaywrightWindow();
    });

    this.electronWindow.on('restore', () => {
      this.showPlaywrightWindow();
    });
  }

  /**
   * Calculate the exact position where WebContentsView would be
   */
  private calculateWebViewBounds(): { x: number; y: number; width: number; height: number } {
    const electronBounds = this.electronWindow.getBounds();
    const contentBounds = this.electronWindow.getContentBounds();
    
    // Account for window frame differences
    const frameDiffX = contentBounds.x - electronBounds.x;
    const frameDiffY = contentBounds.y - electronBounds.y;
    
    // Calculate position for WebContentsView area
    // Assuming sidebar is 320px and tabbar is 40px high
    const SIDEBAR_WIDTH = 320;
    const TABBAR_HEIGHT = 40;
    
    return {
      x: contentBounds.x + SIDEBAR_WIDTH,
      y: contentBounds.y + TABBAR_HEIGHT,
      width: contentBounds.width - SIDEBAR_WIDTH,
      height: contentBounds.height - TABBAR_HEIGHT
    };
  }

  /**
   * Start recording with integrated Playwright browser
   */
  public async startRecording(sessionId: string, startUrl?: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Recording is already in progress');
      return false;
    }

    try {
      // Calculate exact position for Playwright window
      this.windowBounds = this.calculateWebViewBounds();
      
      // Hide Electron's WebContentsView
      this.electronWindow.webContents.send('hide-webview');
      
      // Launch Playwright with special window configuration
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          '--window-position=' + this.windowBounds.x + ',' + this.windowBounds.y,
          '--window-size=' + this.windowBounds.width + ',' + this.windowBounds.height,
          '--disable-blink-features=AutomationControlled',
          '--disable-features=site-per-process',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          // Custom chrome flags for integration
          '--app=' + (startUrl || 'https://www.google.com'),
          '--disable-extensions',
          '--disable-component-extensions-with-background-pages',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-translate',
          '--metrics-recording-only',
          '--disable-default-apps',
          '--mute-audio',
          '--no-default-browser-check',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--force-color-profile=srgb'
        ]
      });

      // Create context with viewport matching our window
      this.playwrightContext = await this.playwrightBrowser.newContext({
        viewport: {
          width: this.windowBounds.width,
          height: this.windowBounds.height
        },
        recordVideo: {
          dir: this.recordingsDir,
          size: {
            width: this.windowBounds.width,
            height: this.windowBounds.height
          }
        }
      });

      // Start tracing for codegen
      await this.playwrightContext.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      // Create page
      this.playwrightPage = await this.playwrightContext.newPage();
      
      // Navigate to start URL
      if (startUrl) {
        await this.playwrightPage.goto(startUrl);
      }

      // Set up action recording
      this.setupActionRecording();
      
      // Apply window styling via JavaScript injection
      await this.applyWindowStyling();
      
      this.isRecording = true;
      console.log(`Integrated recording started for session: ${sessionId}`);
      
      // Notify Electron that recording has started
      this.electronWindow.webContents.send('recording-started', { sessionId });
      
      return true;

    } catch (error) {
      console.error('Failed to start integrated recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Apply custom styling to make Playwright window appear integrated
   */
  private async applyWindowStyling(): Promise<void> {
    if (!this.playwrightPage) return;

    try {
      // Inject CSS to hide browser chrome elements
      await this.playwrightPage.addStyleTag({
        content: `
          /* Hide scrollbars that might appear differently */
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          ::-webkit-scrollbar-track {
            background: #f1f1f1;
          }
          ::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
          
          /* Ensure consistent font rendering */
          body {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
        `
      });
    } catch (error) {
      console.warn('Failed to apply window styling:', error);
    }
  }

  /**
   * Set up recording of user actions
   */
  private setupActionRecording(): void {
    if (!this.playwrightPage) return;

    const recordedActions: any[] = [];
    
    // Record navigation
    this.playwrightPage.on('framenavigated', (frame) => {
      if (frame === this.playwrightPage!.mainFrame()) {
        recordedActions.push({
          type: 'navigate',
          url: frame.url(),
          timestamp: Date.now()
        });
      }
    });

    // Use CDP to capture more detailed events
    this.playwrightPage.on('request', (request) => {
      if (request.isNavigationRequest()) {
        recordedActions.push({
          type: 'navigation',
          url: request.url(),
          method: request.method(),
          timestamp: Date.now()
        });
      }
    });

    // Store recorded actions
    (this.playwrightPage as any).__recordedActions = recordedActions;
  }

  /**
   * Sync Playwright window position with Electron window
   */
  private async syncPlaywrightWindowPosition(): Promise<void> {
    if (!this.isRecording || !this.playwrightPage) return;
    
    const newBounds = this.calculateWebViewBounds();
    
    // Update Playwright window position and size
    try {
      await this.playwrightPage.evaluate((bounds) => {
        // This would need platform-specific implementation
        // For now, log the intent
        console.log('Would resize Playwright window to:', bounds);
      }, newBounds);
      
      this.windowBounds = newBounds;
    } catch (error) {
      console.warn('Failed to sync window position:', error);
    }
  }

  /**
   * Focus the Playwright window when Electron window is focused
   */
  private async focusPlaywrightWindow(): Promise<void> {
    if (!this.isRecording || !this.playwrightPage) return;
    
    try {
      await this.playwrightPage.bringToFront();
    } catch (error) {
      console.warn('Failed to focus Playwright window:', error);
    }
  }

  /**
   * Hide Playwright window when Electron is minimized
   */
  private async hidePlaywrightWindow(): Promise<void> {
    if (!this.isRecording || !this.playwrightPage) return;
    
    // Playwright doesn't directly support window hiding
    // Would need platform-specific implementation
    console.log('Would hide Playwright window');
  }

  /**
   * Show Playwright window when Electron is restored
   */
  private async showPlaywrightWindow(): Promise<void> {
    if (!this.isRecording || !this.playwrightPage) return;
    
    // Playwright doesn't directly support window showing
    // Would need platform-specific implementation
    console.log('Would show Playwright window');
  }

  /**
   * Stop recording and generate code
   */
  public async stopRecording(): Promise<any> {
    if (!this.isRecording || !this.playwrightContext || !this.playwrightPage) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      const sessionId = `integrated-${Date.now()}`;
      
      // Get recorded actions
      const recordedActions = (this.playwrightPage as any).__recordedActions || [];
      
      // Stop tracing
      const tracePath = path.join(this.recordingsDir, `${sessionId}-trace.zip`);
      await this.playwrightContext.tracing.stop({ path: tracePath });
      
      // Take final screenshot
      const screenshotPath = path.join(this.recordingsDir, `${sessionId}-final.png`);
      await this.playwrightPage.screenshot({ 
        path: screenshotPath,
        fullPage: true 
      });
      
      // Generate Playwright test code
      const testCode = this.generateTestCode(recordedActions, sessionId);
      
      // Save test file
      const specPath = path.join(this.recordingsDir, `${sessionId}-test.spec.ts`);
      await fs.writeFile(specPath, testCode, 'utf8');
      
      // Clean up
      await this.cleanup();
      
      // Show Electron's WebContentsView again
      this.electronWindow.webContents.send('show-webview');
      
      // Notify Electron that recording has stopped
      this.electronWindow.webContents.send('recording-stopped', {
        sessionId,
        tracePath,
        screenshotPath,
        specPath,
        actions: recordedActions
      });
      
      return {
        sessionId,
        tracePath,
        screenshotPath,
        specPath,
        actions: recordedActions
      };
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      await this.cleanup();
      return null;
    }
  }

  /**
   * Generate Playwright test code from recorded actions
   */
  private generateTestCode(actions: any[], sessionId: string): string {
    const startUrl = actions.find(a => a.type === 'navigate')?.url || 'https://example.com';
    const endUrl = actions[actions.length - 1]?.url || startUrl;
    
    return `import { test, expect } from '@playwright/test';

test('Integrated Recording - ${sessionId}', async ({ page }) => {
  // Navigate to start URL
  await page.goto('${startUrl}');
  
  // Recorded actions
${actions.map(action => {
  switch(action.type) {
    case 'navigate':
      return `  await page.goto('${action.url}');`;
    case 'click':
      return `  await page.click('${action.selector}');`;
    case 'fill':
      return `  await page.fill('${action.selector}', '${action.value}');`;
    default:
      return `  // ${action.type}: ${JSON.stringify(action)}`;
  }
}).join('\n')}
  
  // Verify final state
  await expect(page).toHaveURL('${endUrl}');
});

// Recording metadata
// Session: ${sessionId}
// Start: ${startUrl}
// End: ${endUrl}
// Actions: ${actions.length}
`;
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    this.isRecording = false;
    
    try {
      if (this.playwrightPage) {
        await this.playwrightPage.close();
      }
      if (this.playwrightContext) {
        await this.playwrightContext.close();
      }
      if (this.playwrightBrowser) {
        await this.playwrightBrowser.close();
      }
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
    
    this.playwrightPage = null;
    this.playwrightContext = null;
    this.playwrightBrowser = null;
  }

  /**
   * Get recording status
   */
  public getRecordingStatus(): { isRecording: boolean } {
    return { isRecording: this.isRecording };
  }
}