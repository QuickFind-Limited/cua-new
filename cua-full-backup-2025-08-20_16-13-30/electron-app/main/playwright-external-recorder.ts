import { BrowserWindow, ipcMain } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';

/**
 * Playwright Recorder with External Chromium Launch
 * Launches Chromium via child_process (for PID control) then connects Playwright via CDP
 */
export class PlaywrightExternalRecorder {
  private electronWindow: BrowserWindow;
  private chromiumProcess: ChildProcess | null = null;
  private chromiumPid: number | null = null;
  private playwrightBrowser: Browser | null = null;
  private playwrightContext: BrowserContext | null = null;
  private isRecording = false;
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private recordedActions: any[] = [];
  private currentSession: any = null;
  private debugPort = 9223; // Different port to avoid conflicts

  constructor(electronWindow: BrowserWindow) {
    this.electronWindow = electronWindow;
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
   * Find Chromium executable
   */
  private findChromiumPath(): string | null {
    // First, try to get Playwright's chromium executable path
    try {
      const { chromium } = require('playwright');
      // This returns the path to playwright's chromium
      const browserPath = chromium.executablePath();
      if (browserPath && existsSync(browserPath)) {
        console.log('Using Playwright bundled Chromium:', browserPath);
        return browserPath;
      }
    } catch (e) {
      console.log('Could not get Playwright chromium path:', e);
    }

    const paths = [
      // System Chromium (prioritize over Chrome)
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Chromium\\Application\\chrome.exe'),
      // Chrome as last resort fallback
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    
    for (const chromiumPath of paths) {
      // Handle glob pattern for Playwright's chromium
      if (chromiumPath.includes('*')) {
        const dir = path.dirname(chromiumPath);
        const pattern = path.basename(chromiumPath);
        if (existsSync(dir)) {
          try {
            const entries = require('fs').readdirSync(dir);
            for (const entry of entries) {
              if (entry.startsWith('chromium-')) {
                const fullPath = path.join(dir, entry, 'chrome-win', 'chrome.exe');
                if (existsSync(fullPath)) {
                  return fullPath;
                }
              }
            }
          } catch (e) {
            // Continue to next path
          }
        }
      } else if (existsSync(chromiumPath)) {
        return chromiumPath;
      }
    }
    
    return null;
  }

  /**
   * Start recording with external Chromium launch
   */
  public async startRecording(sessionId: string, startUrl?: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Recording is already in progress');
      return false;
    }

    try {
      this.currentSession = {
        id: sessionId,
        startTime: Date.now(),
        url: startUrl || 'https://www.google.com'
      };

      // Find Chromium
      const chromiumPath = this.findChromiumPath();
      if (!chromiumPath) {
        throw new Error('Chromium executable not found');
      }
      console.log('Using Chromium at:', chromiumPath);

      // Get window bounds for sizing
      const bounds = this.electronWindow.getContentBounds();
      const sidebarWidth = 320;
      const viewWidth = bounds.width - sidebarWidth;
      const viewHeight = bounds.height;

      // Launch Chromium with CDP enabled
      const args = [
        `--remote-debugging-port=${this.debugPort}`,
        '--no-first-run',
        '--no-default-browser-check',
        // Removed --disable-blink-features=AutomationControlled to avoid warning
        '--disable-infobars',  // Disable info bars
        '--disable-component-extensions-with-background-pages', // Disable background extensions
        '--disable-backgrounding-occluded-windows', // Keep windows active
        '--disable-renderer-backgrounding', // Keep renderer active
        '--disable-features=TranslateUI', // Disable translate popup
        '--disable-ipc-flooding-protection', // Better automation performance
        '--disable-default-apps', // Don't install default apps
        '--no-service-autorun', // Don't autorun services
        '--password-store=basic', // Use basic password store
        '--start-maximized',  // Start maximized
        '--new-window',  // Force new window
        '--user-data-dir=' + path.join(process.cwd(), 'chrome-recording-profile'), // Use separate profile
        startUrl || 'about:blank'
      ];

      console.log('Launching Chromium with args:', args);
      
      // Set environment variables to suppress Google API warnings
      const env = {
        ...process.env,
        GOOGLE_API_KEY: 'no',
        GOOGLE_DEFAULT_CLIENT_ID: 'no',
        GOOGLE_DEFAULT_CLIENT_SECRET: 'no'
      };
      
      this.chromiumProcess = spawn(chromiumPath, args, {
        detached: false,
        stdio: 'ignore',
        env: env
      });

      this.chromiumPid = this.chromiumProcess.pid || null;
      console.log('Chromium launched with PID:', this.chromiumPid);

      // Wait for CDP to be ready
      await this.waitForCDP();

      // Connect Playwright to the running Chromium
      console.log('Connecting Playwright to CDP...');
      this.playwrightBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${this.debugPort}`);
      
      // Get the default context (already created by Chromium)
      const contexts = this.playwrightBrowser.contexts();
      if (contexts.length > 0) {
        this.playwrightContext = contexts[0];
      } else {
        // Create new context if needed
        this.playwrightContext = await this.playwrightBrowser.newContext();
      }

      // Get or create a page
      const pages = this.playwrightContext.pages();
      let page: Page;
      if (pages.length > 0) {
        page = pages[0];
      } else {
        page = await this.playwrightContext.newPage();
        if (startUrl) {
          await page.goto(startUrl);
        }
      }

      // Setup recording on the page
      await this.setupPageRecording(page);

      // Start tracing
      await this.playwrightContext.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      this.isRecording = true;
      console.log(`Recording started for session: ${sessionId}`);
      
      // Update UI
      this.electronWindow.webContents.send('recording-started', { 
        sessionId,
        mode: 'external-chromium',
        chromiumPid: this.chromiumPid
      });

      // Monitor for browser close
      this.chromiumProcess.on('exit', () => {
        if (this.isRecording) {
          console.log('Chromium closed by user, cleaning up...');
          // Just clean up, don't try to save since browser is already closed
          this.cleanup();
          // Notify UI that recording was cancelled
          this.electronWindow.webContents.send('recording-cancelled', { 
            sessionId,
            reason: 'Browser closed by user'
          });
        }
      });

      return true;

    } catch (error) {
      console.error('Failed to start recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Wait for Chrome DevTools Protocol to be ready
   */
  private async waitForCDP(maxAttempts = 100): Promise<void> {
    console.log(`Waiting for CDP on port ${this.debugPort}...`);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.debugPort}/json/version`);
        if (response.ok) {
          const version = await response.json();
          console.log('CDP ready:', version.Browser);
          return;
        }
      } catch (e) {
        // Not ready yet
        if (i % 10 === 0) {
          console.log(`Still waiting for CDP... attempt ${i}/${maxAttempts}`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`CDP failed to start within timeout on port ${this.debugPort}`);
  }

  /**
   * Setup page recording
   */
  private async setupPageRecording(page: Page): Promise<void> {
    // Track navigation
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        this.recordedActions.push({
          type: 'navigate',
          url: frame.url(),
          timestamp: Date.now()
        });
      }
    });

    // Inject action recorder
    await page.addInitScript(() => {
      (window as any).__recordedActions = [];
      
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        (window as any).__recordedActions.push({
          type: 'click',
          selector: target.tagName.toLowerCase() + (target.id ? '#' + target.id : ''),
          text: target.textContent?.substring(0, 30),
          timestamp: Date.now()
        });
      }, true);
      
      document.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        (window as any).__recordedActions.push({
          type: 'input',
          selector: target.tagName.toLowerCase() + (target.id ? '#' + target.id : ''),
          value: target.value,
          timestamp: Date.now()
        });
      }, true);
    });
  }

  /**
   * Stop recording
   */
  public async stopRecording(): Promise<any> {
    if (!this.isRecording || !this.currentSession || !this.playwrightContext) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      this.currentSession.endTime = Date.now();
      const sessionId = this.currentSession.id;
      
      // Collect client-side actions
      const pages = this.playwrightContext.pages();
      for (const page of pages) {
        try {
          const clientActions = await page.evaluate(() => {
            return (window as any).__recordedActions || [];
          });
          this.recordedActions.push(...clientActions);
        } catch (e) {
          // Page might be closed
        }
      }
      
      // Sort actions
      this.recordedActions.sort((a, b) => a.timestamp - b.timestamp);
      
      // Stop tracing
      const tracePath = path.join(this.recordingsDir, `${sessionId}-trace.zip`);
      await this.playwrightContext.tracing.stop({ path: tracePath });
      
      // Generate test code
      const testCode = this.generateTestCode(sessionId);
      
      // Save test file
      const specPath = path.join(this.recordingsDir, `${sessionId}-test.spec.ts`);
      await fs.writeFile(specPath, testCode, 'utf8');
      
      // Create metadata
      const metadata = {
        sessionId,
        startUrl: this.currentSession.url,
        startTime: this.currentSession.startTime,
        endTime: this.currentSession.endTime,
        duration: this.currentSession.endTime - this.currentSession.startTime,
        actionCount: this.recordedActions.length,
        tracePath,
        specPath
      };
      
      const metadataPath = path.join(this.recordingsDir, `${sessionId}-metadata.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      
      // Clean up
      await this.cleanup();
      
      // Notify UI
      this.electronWindow.webContents.send('recording-stopped', metadata);
      
      console.log(`Recording stopped. Generated ${specPath}`);
      
      return {
        session: metadata,
        specCode: testCode,
        specPath,
        metadataPath,
        actions: this.recordedActions
      };
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      await this.cleanup();
      return null;
    }
  }

  /**
   * Generate test code
   */
  private generateTestCode(sessionId: string): string {
    const startUrl = this.currentSession.url;
    let testSteps = '';
    
    for (const action of this.recordedActions) {
      switch(action.type) {
        case 'navigate':
          testSteps += `  await page.goto('${action.url}');\n`;
          break;
        case 'click':
          testSteps += `  await page.click('${action.selector}'); // ${action.text || ''}\n`;
          break;
        case 'input':
          testSteps += `  await page.fill('${action.selector}', '${action.value}');\n`;
          break;
      }
    }
    
    return `import { test, expect } from '@playwright/test';

test('Recording - ${sessionId}', async ({ page }) => {
  await page.goto('${startUrl}');
  
${testSteps}
});

// Session: ${sessionId}
// Duration: ${Math.round((this.currentSession.endTime - this.currentSession.startTime) / 1000)}s
// Actions: ${this.recordedActions.length}
`;
  }

  /**
   * Clean up
   */
  private async cleanup(): Promise<void> {
    this.isRecording = false;
    
    try {
      if (this.playwrightBrowser) {
        await this.playwrightBrowser.close();
      }
    } catch (error) {
      console.warn('Error closing Playwright browser:', error);
    }
    
    try {
      if (this.chromiumProcess && !this.chromiumProcess.killed) {
        this.chromiumProcess.kill();
      }
    } catch (error) {
      console.warn('Error killing Chromium process:', error);
    }
    
    this.playwrightBrowser = null;
    this.playwrightContext = null;
    this.chromiumProcess = null;
    this.chromiumPid = null;
    this.recordedActions = [];
    this.currentSession = null;
  }

  /**
   * Get recording status
   */
  public getRecordingStatus(): any {
    return {
      isRecording: this.isRecording,
      sessionId: this.currentSession?.id,
      startTime: this.currentSession?.startTime,
      actionCount: this.recordedActions.length,
      chromiumPid: this.chromiumPid
    };
  }

  public async dispose(): Promise<void> {
    await this.cleanup();
  }
}