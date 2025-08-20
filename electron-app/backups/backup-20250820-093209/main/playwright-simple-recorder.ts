import { BrowserWindow, ipcMain } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Simple Playwright Recorder - Records in external Chromium window
 * This is a simpler, more reliable approach that doesn't require embedding
 */
export class PlaywrightSimpleRecorder {
  private electronWindow: BrowserWindow;
  private playwrightBrowser: Browser | null = null;
  private playwrightContext: BrowserContext | null = null;
  private isRecording = false;
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private recordedActions: any[] = [];
  private currentSession: any = null;

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
   * Start recording in external Chromium window
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

      console.log('Launching Chromium for recording...');
      
      // Launch Chromium with visible UI
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      // Create context with recording capabilities
      this.playwrightContext = await this.playwrightBrowser.newContext({
        viewport: null, // Use natural viewport
        recordVideo: {
          dir: this.recordingsDir,
          size: { width: 1280, height: 720 }
        }
      });

      // Start tracing for detailed recording
      await this.playwrightContext.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      // Create page and setup recording
      const page = await this.playwrightContext.newPage();
      await this.setupPageRecording(page);
      
      // Navigate to start URL
      if (startUrl) {
        await page.goto(startUrl);
      }

      this.isRecording = true;
      console.log(`Recording started for session: ${sessionId}`);
      
      // Notify UI
      this.electronWindow.webContents.send('recording-started', { 
        sessionId,
        mode: 'external-chromium',
        instructions: 'Recording in external Chromium window. Close the window or click Stop to finish.'
      });

      // Monitor for browser close
      this.playwrightBrowser.on('disconnected', () => {
        if (this.isRecording) {
          console.log('Browser closed by user, stopping recording...');
          this.stopRecording();
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
   * Setup page recording with action tracking
   */
  private async setupPageRecording(page: Page): Promise<void> {
    // Track page navigation
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        this.recordedActions.push({
          type: 'navigate',
          url: frame.url(),
          timestamp: Date.now()
        });
      }
    });

    // Inject client-side action recorder
    await page.addInitScript(() => {
      (window as any).__recordedActions = [];
      
      // Record clicks
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const selector = target.tagName.toLowerCase() + 
                        (target.id ? '#' + target.id : '') +
                        (target.className ? '.' + target.className.split(' ').join('.') : '');
        
        (window as any).__recordedActions.push({
          type: 'click',
          selector,
          text: target.textContent?.substring(0, 50),
          timestamp: Date.now()
        });
      }, true);
      
      // Record form inputs
      document.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const selector = target.tagName.toLowerCase() + 
                        (target.id ? '#' + target.id : '') +
                        (target.name ? `[name="${target.name}"]` : '');
        
        (window as any).__recordedActions.push({
          type: 'input',
          selector,
          value: target.type === 'password' ? '***' : target.value,
          timestamp: Date.now()
        });
      }, true);

      // Record form submissions
      document.addEventListener('submit', (e) => {
        const target = e.target as HTMLFormElement;
        (window as any).__recordedActions.push({
          type: 'submit',
          formId: target.id || 'unnamed-form',
          timestamp: Date.now()
        });
      }, true);
    });
  }

  /**
   * Stop recording and save results
   */
  public async stopRecording(): Promise<any> {
    if (!this.isRecording || !this.currentSession || !this.playwrightContext) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      this.currentSession.endTime = Date.now();
      const sessionId = this.currentSession.id;
      
      // Get client-side recorded actions from all pages
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
      
      // Sort actions by timestamp
      this.recordedActions.sort((a, b) => a.timestamp - b.timestamp);
      
      // Stop tracing and save
      const tracePath = path.join(this.recordingsDir, `${sessionId}-trace.zip`);
      await this.playwrightContext.tracing.stop({ path: tracePath });
      
      // Generate Playwright test code
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
        specPath,
        recordingMode: 'external-chromium'
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
   * Generate Playwright test code from recorded actions
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
          const value = action.value === '***' ? '{{PASSWORD}}' : action.value;
          testSteps += `  await page.fill('${action.selector}', '${value}');\n`;
          break;
        case 'submit':
          testSteps += `  // Form submitted: ${action.formId}\n`;
          break;
      }
    }
    
    return `import { test, expect } from '@playwright/test';

test('Recording - ${sessionId}', async ({ page }) => {
  // Start URL: ${startUrl}
  // Recorded ${this.recordedActions.length} actions
  
  await page.goto('${startUrl}');
  
${testSteps}
  
  // Add assertions here
});

/*
 * Recording Session: ${sessionId}
 * Duration: ${Math.round((this.currentSession.endTime - this.currentSession.startTime) / 1000)}s
 * Actions: ${this.recordedActions.length}
 * 
 * To replay this test:
 * npx playwright test ${sessionId}-test.spec.ts
 * 
 * To view the trace:
 * npx playwright show-trace recordings/${sessionId}-trace.zip
 */
`;
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    this.isRecording = false;
    
    try {
      if (this.playwrightContext) {
        await this.playwrightContext.close();
      }
      if (this.playwrightBrowser) {
        await this.playwrightBrowser.close();
      }
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
    
    this.playwrightContext = null;
    this.playwrightBrowser = null;
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
      mode: 'external-chromium'
    };
  }

  public async dispose(): Promise<void> {
    await this.cleanup();
  }
}