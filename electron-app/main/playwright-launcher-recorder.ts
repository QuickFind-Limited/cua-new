import { BrowserWindow, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { existsSync, writeFileSync } from 'fs';
import * as chokidar from 'chokidar';
import { chromium, Browser, Page } from 'playwright';

/**
 * Playwright Launcher Recorder
 * Launches Playwright codegen and watches for saved recordings
 * User controls recording entirely through Playwright's interface
 */
export class PlaywrightLauncherRecorder {
  private electronWindow: BrowserWindow;
  private codegenProcess: ChildProcess | null = null;
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private fileWatcher: chokidar.FSWatcher | null = null;
  private currentOutputPath: string | null = null;
  private lastFileSize = 0;
  private lastModified = 0;
  private isRecordingActive = false;
  private lastRecordingData: any = null;
  private cdpBrowser: Browser | null = null;
  private cdpPage: Page | null = null;
  private stopButtonClicked = false;
  private screenshotPath: string | null = null;

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
   * Find Playwright executable
   */
  private findPlaywrightExecutable(): string {
    return this.findPlaywrightPath() || 'playwright';
  }
  
  /**
   * Find Playwright executable
   */
  private findPlaywrightPath(): string | null {
    const possiblePaths = [
      // Local node_modules
      path.join(process.cwd(), 'node_modules', '.bin', 'playwright.cmd'),
      path.join(process.cwd(), 'node_modules', '.bin', 'playwright'),
      // Electron app node_modules
      path.join(__dirname, '..', '..', 'node_modules', '.bin', 'playwright.cmd'),
      path.join(__dirname, '..', '..', 'node_modules', '.bin', 'playwright'),
      // Global installation
      'playwright'
    ];

    for (const playwrightPath of possiblePaths) {
      if (playwrightPath === 'playwright') {
        // Check if globally available
        try {
          const { execSync } = require('child_process');
          execSync('playwright --version', { stdio: 'ignore' });
          return 'playwright';
        } catch {
          continue;
        }
      } else if (existsSync(playwrightPath)) {
        return playwrightPath;
      }
    }

    // Try npx as fallback
    try {
      const { execSync } = require('child_process');
      execSync('npx playwright --version', { stdio: 'ignore' });
      return 'npx playwright';
    } catch {
      // npx not available or playwright not installed
    }

    return null;
  }

  /**
   * Launch Playwright recorder
   * User controls everything through Playwright's interface
   */
  public async launchRecorder(startUrl?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find playwright executable
      const playwrightPath = this.findPlaywrightPath();
      if (!playwrightPath) {
        return { 
          success: false, 
          error: 'Playwright not found. Please install Playwright: npm install -D @playwright/test' 
        };
      }
      
      // Set recording flag
      this.isRecordingActive = true;

      // Generate output file path
      const sessionId = `recording-${Date.now()}`;
      this.currentOutputPath = path.join(this.recordingsDir, `${sessionId}.spec.ts`);
      
      // Build codegen command with CDP debugging
      const args = [
        'codegen',
        '--target=playwright-test',
        `--output=${this.currentOutputPath}`,
        '--browser=chromium',
        '--browser-arg=--remote-debugging-port=9223'  // Enable CDP on port 9223
      ];
      
      // Add URL if provided
      if (startUrl) {
        args.push(startUrl);
      }

      console.log('Launching Playwright recorder...');
      console.log('Output will be saved to:', this.currentOutputPath);
      
      // Create environment - inspector will be shown for full control
      const env = { ...process.env };
      // env.PW_CODEGEN_NO_INSPECTOR = 'true';  // Commented out - showing inspector for better recording control
      
      // Launch playwright codegen with environment variable
      if (playwrightPath === 'playwright' || playwrightPath.includes('npx')) {
        const [cmd, ...cmdArgs] = playwrightPath.split(' ');
        this.codegenProcess = spawn(cmd, [...cmdArgs, ...args], {
          stdio: 'pipe',
          shell: true,
          env
        });
      } else {
        this.codegenProcess = spawn(playwrightPath, args, {
          stdio: 'pipe',
          shell: process.platform === 'win32',
          env
        });
      }
      
      // Handle process output silently
      this.codegenProcess.stdout?.on('data', (data) => {
        console.log('Codegen output:', data.toString());
      });
      
      this.codegenProcess.stderr?.on('data', (data) => {
        console.error('Codegen error:', data.toString());
      });
      
      // Watch for file changes
      this.startFileWatcher();

      // Connect to Playwright browser via CDP after a short delay
      setTimeout(() => {
        this.connectToCDPBrowser(sessionId).catch(err => {
          console.error('Failed to connect via CDP:', err);
        });
      }, 3000); // Give Playwright time to launch browser

      // Handle process exit
      this.codegenProcess.on('exit', (code) => {
        console.log(`Playwright recorder exited with code ${code}`);
        this.handleRecorderClosed();
      });

      this.codegenProcess.on('error', (error) => {
        console.error('Failed to launch Playwright recorder:', error);
        this.cleanup();
      });

      // Notify UI
      this.electronWindow.webContents.send('recorder-launched', { 
        sessionId,
        outputPath: this.currentOutputPath,
        instructions: 'Use Playwright Inspector to record your actions. Save or close when done.'
      });

      return { success: true };

    } catch (error) {
      console.error('Failed to launch recorder:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Start watching for file changes using chokidar
   */
  private startFileWatcher(): void {
    if (!this.currentOutputPath) return;

    console.log('Starting file watcher for:', this.currentOutputPath);

    // Use chokidar for more reliable file watching
    this.fileWatcher = chokidar.watch(this.currentOutputPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    this.fileWatcher
      .on('add', (path) => {
        console.log('Recording file created:', path);
        this.handleFileCreated(path);
      })
      .on('change', (path) => {
        console.log('Recording file changed:', path);
        this.handleFileChanged(path);
      })
      .on('error', (error) => {
        console.error('File watcher error:', error);
      });

    // Also start polling as backup
    this.startPollingForChanges();
  }

  /**
   * Poll for file changes as backup to file watching
   */
  private startPollingForChanges(): void {
    const pollInterval = setInterval(async () => {
      if (!this.currentOutputPath || !this.isRecordingActive) {
        clearInterval(pollInterval);
        return;
      }

      try {
        if (existsSync(this.currentOutputPath)) {
          const stats = await fs.stat(this.currentOutputPath);
          const currentSize = stats.size;
          const currentModified = stats.mtime.getTime();

          if (currentSize !== this.lastFileSize || currentModified !== this.lastModified) {
            this.lastFileSize = currentSize;
            this.lastModified = currentModified;

            if (currentSize > 0) {
              await this.processFileChange(this.currentOutputPath, stats);
            }
          }
        }
      } catch (error) {
        // File might not exist yet
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Handle file creation
   */
  private async handleFileCreated(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > 0) {
        await this.processFileChange(filePath, stats);
      }
    } catch (error) {
      console.error('Error handling file creation:', error);
    }
  }

  /**
   * Handle file changes
   */
  private async handleFileChanged(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      await this.processFileChange(filePath, stats);
    } catch (error) {
      console.error('Error handling file change:', error);
    }
  }

  /**
   * Process file changes and notify UI
   */
  private async processFileChange(filePath: string, stats: any): Promise<void> {
    // If stop button was clicked, skip file processing (already handled via CDP)
    if (this.stopButtonClicked) {
      console.log('[FileWatcher] Skipping file change - stop button already handled');
      return;
    }
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Count Playwright actions to gauge recording progress
      const actionCount = this.countPlaywrightActions(content);
      
      // Check if recording has been stopped (test is complete)
      const isRecordingStopped = this.isRecordingComplete(content);
      
      console.log(`Recording updated: ${actionCount} actions recorded${isRecordingStopped ? ' (RECORDING STOPPED)' : ''}`);
      
      // If recording just stopped via file change (not button), we can't capture screenshot
      // because browser might already be closing
      let screenshotPath: string | undefined;
      if (isRecordingStopped && !this.lastRecordingData?.recordingStopped) {
        console.log('Recording stopped detected via file change - browser may be closing');
        // Don't attempt screenshot - browser likely gone
      }
      
      // Store recording data
      this.lastRecordingData = {
        path: filePath,
        size: stats.size,
        actionCount,
        timestamp: Date.now(),
        specCode: content,
        recordingStopped: isRecordingStopped,
        screenshotPath
      };
      
      // Notify UI that recording was saved/updated
      this.electronWindow.webContents.send('recording-saved', this.lastRecordingData);
    } catch (error) {
      console.error('Error processing file change:', error);
    }
  }
  
  /**
   * Check if the recording is complete (test closure detected)
   */
  private isRecordingComplete(content: string): boolean {
    // When user clicks stop in the floating toolbar, Playwright writes the complete test
    // A complete test has the structure: test('...', async ({ page }) => { ... });
    
    // Check if we have both opening and closing brackets for the test
    const hasTestOpening = content.includes("test('") || content.includes('test("');
    const hasAsyncFunction = content.includes('async ({ page })') || content.includes('async ({page})');
    const hasClosingBrackets = content.trim().endsWith('});');
    
    // Also check if the last action is followed by the closing brackets
    // (no more actions will be added after the stop button is clicked)
    const lines = content.trim().split('\n');
    const lastFewLines = lines.slice(-3).join('\n');
    const hasProperClosure = lastFewLines.includes('});');
    
    return hasTestOpening && hasAsyncFunction && (hasClosingBrackets || hasProperClosure);
  }
  
  /**
   * Capture screenshot of current browser state
   */
  private async captureSuccessScreenshot(recordingPath: string): Promise<string | undefined> {
    console.log('[Screenshot] Starting capture for recording:', recordingPath);
    
    try {
      const sessionId = path.basename(recordingPath, '.spec.ts');
      const screenshotPath = path.join(this.recordingsDir, `${sessionId}-success.png`);
      console.log('[Screenshot] Target path:', screenshotPath);
      
      // Get the active tab manager to capture screenshot
      console.log('[Screenshot] Importing tab manager...');
      const { getTabManager } = await import('./main');
      const tabManager = getTabManager();
      console.log('[Screenshot] Tab manager obtained:', !!tabManager);
      
      if (tabManager) {
        const activeTab = tabManager.getActiveTab();
        console.log('[Screenshot] Active tab found:', !!activeTab);
        console.log('[Screenshot] Active tab has view:', !!activeTab?.view);
        
        if (activeTab?.view) {
          console.log('[Screenshot] WebContents available:', !!activeTab.view.webContents);
          
          // Check if webContents is destroyed
          if (activeTab.view.webContents.isDestroyed()) {
            console.log('[Screenshot] ERROR: WebContents is destroyed!');
            return undefined;
          }
          
          // Get the URL being recorded
          const currentUrl = activeTab.view.webContents.getURL();
          console.log('[Screenshot] Current URL:', currentUrl);
          
          console.log('[Screenshot] Capturing page...');
          const screenshot = await activeTab.view.webContents.capturePage();
          console.log('[Screenshot] Screenshot captured, size:', screenshot ? screenshot.getSize() : 'null');
          
          console.log('[Screenshot] Converting to PNG...');
          const pngBuffer = screenshot.toPNG();
          console.log('[Screenshot] PNG buffer size:', pngBuffer.length);
          
          console.log('[Screenshot] Writing to file...');
          await fs.writeFile(screenshotPath, pngBuffer);
          console.log('[Screenshot] Success! Screenshot saved:', screenshotPath);
          
          // Verify file was written
          const stats = await fs.stat(screenshotPath);
          console.log('[Screenshot] File verified, size:', stats.size, 'bytes');
          
          return screenshotPath;
        } else {
          console.log('[Screenshot] No active tab with view available');
          
          // Try alternative: look for Playwright browser window
          console.log('[Screenshot] Attempting to find Playwright browser window...');
          const { BrowserWindow } = await import('electron');
          const allWindows = BrowserWindow.getAllWindows();
          console.log('[Screenshot] Total windows:', allWindows.length);
          
          for (const win of allWindows) {
            const title = win.getTitle();
            const url = win.webContents.getURL();
            console.log(`[Screenshot] Window: ${title}, URL: ${url}`);
            
            // Check if this might be the Playwright browser
            if (!url.includes('localhost:') && !url.includes('file://')) {
              console.log('[Screenshot] Found potential browser window, attempting capture...');
              try {
                const screenshot = await win.webContents.capturePage();
                await fs.writeFile(screenshotPath, screenshot.toPNG());
                console.log('[Screenshot] Alternative capture successful!');
                return screenshotPath;
              } catch (altError) {
                console.log('[Screenshot] Alternative capture failed:', altError);
              }
            }
          }
        }
      } else {
        console.log('[Screenshot] No tab manager available');
      }
    } catch (error) {
      console.error('[Screenshot] Failed to capture:', error);
      console.error('[Screenshot] Error stack:', (error as Error).stack);
    }
    return undefined;
  }

  /**
   * Count Playwright actions in the spec code
   */
  private countPlaywrightActions(content: string): number {
    const actionPatterns = [
      /await page\.click\(/g,
      /await page\.fill\(/g,
      /await page\.type\(/g,
      /await page\.goto\(/g,
      /await page\.press\(/g,
      /await page\.selectOption\(/g,
      /await page\.getByRole\(/g,
      /await page\.getByLabel\(/g,
      /await page\.getByText\(/g,
      /await page\.getByTestId\(/g,
      /await page\.locator\(/g
    ];

    return actionPatterns.reduce((count, pattern) => {
      return count + (content.match(pattern) || []).length;
    }, 0);
  }

  /**
   * Connect to Playwright browser via CDP
   */
  private async connectToCDPBrowser(sessionId: string): Promise<void> {
    console.log('[CDP] Attempting to connect to Playwright browser...');
    
    // Try common CDP ports
    const ports = [9222, 9223, 9224, 9225, 9333, 9335];
    
    for (const port of ports) {
      try {
        console.log(`[CDP] Trying port ${port}...`);
        
        // First check if port is accessible
        const response = await fetch(`http://localhost:${port}/json/version`).catch(() => null);
        if (!response || !response.ok) continue;
        
        console.log(`[CDP] Port ${port} is accessible, connecting...`);
        
        // Connect to the browser
        this.cdpBrowser = await chromium.connectOverCDP(`http://localhost:${port}`);
        console.log(`[CDP] Successfully connected to browser on port ${port}`);
        
        // Get the first context and page
        const contexts = this.cdpBrowser.contexts();
        if (contexts.length > 0) {
          const pages = contexts[0].pages();
          
          // Find the main page (not DevTools)
          this.cdpPage = pages.find(p => !p.url().startsWith('devtools://')) || pages[0];
          
          if (this.cdpPage) {
            console.log('[CDP] Found target page:', this.cdpPage.url());
            
            // Inject stop button detection script
            await this.injectStopButtonDetection(sessionId);
            
            return; // Success
          }
        }
      } catch (error) {
        console.log(`[CDP] Failed to connect on port ${port}:`, error.message);
      }
    }
    
    console.error('[CDP] Failed to connect to Playwright browser on any port');
  }

  /**
   * Inject script to detect stop button click in Playwright toolbar
   */
  private async injectStopButtonDetection(sessionId: string): Promise<void> {
    if (!this.cdpPage) return;
    
    console.log('[CDP] Injecting stop button detection script...');
    
    try {
      // Listen for console messages that we'll trigger
      this.cdpPage.on('console', async (msg) => {
        if (msg.text().includes('PLAYWRIGHT_STOP_CLICKED')) {
          console.log('[CDP] Stop button clicked detected!');
          await this.handleStopButtonClick(sessionId);
        }
      });
      
      // Inject script to detect stop button click
      await this.cdpPage.evaluate(() => {
        console.log('[Injected] Setting up stop button detection...');
        
        // Function to check for stop button
        const detectStopButton = () => {
          // Look for Playwright's recording toolbar
          // The stop button typically has aria-label="Stop" or title="Stop recording"
          const stopButtons = document.querySelectorAll(
            '[aria-label*="Stop"], [title*="Stop"], [title*="stop"], button:has(.codicon-stop-circle)'
          );
          
          stopButtons.forEach(button => {
            // Check if we've already attached listener
            if (!(button as any).__stopListenerAttached) {
              (button as any).__stopListenerAttached = true;
              
              button.addEventListener('click', () => {
                console.log('PLAYWRIGHT_STOP_CLICKED');
                
                // Also try to capture immediately before Playwright processes the click
                setTimeout(() => {
                  console.log('Stop button click processed');
                }, 10);
              }, true); // Use capture phase to get event early
              
              console.log('[Injected] Attached listener to stop button');
            }
          });
        };
        
        // Check immediately
        detectStopButton();
        
        // Also monitor for new buttons (in case toolbar loads later)
        const observer = new MutationObserver(() => {
          detectStopButton();
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-label', 'title']
        });
        
        console.log('[Injected] Stop button detection active');
      });
      
      console.log('[CDP] Stop button detection script injected successfully');
    } catch (error) {
      console.error('[CDP] Failed to inject stop button detection:', error);
    }
  }

  /**
   * Handle stop button click - capture screenshot immediately
   */
  private async handleStopButtonClick(sessionId: string): Promise<void> {
    if (this.stopButtonClicked) {
      console.log('[CDP] Stop button click already processed');
      return;
    }
    
    this.stopButtonClicked = true;
    console.log('[CDP] Processing stop button click...');
    
    try {
      // Capture screenshot immediately
      if (this.cdpPage) {
        this.screenshotPath = path.join(this.recordingsDir, `${sessionId}-success.png`);
        
        console.log('[CDP] Capturing screenshot...');
        const screenshot = await this.cdpPage.screenshot({
          path: this.screenshotPath,
          fullPage: false, // Capture viewport for consistency
          type: 'png'
        });
        
        console.log('[CDP] Screenshot captured successfully:', this.screenshotPath);
        
        // Mark recording as complete
        this.markRecordingComplete(sessionId);
      }
    } catch (error) {
      console.error('[CDP] Failed to capture screenshot:', error);
    }
  }

  /**
   * Mark recording as complete and notify UI
   */
  private markRecordingComplete(sessionId: string): void {
    console.log('[Recording] Marking as complete due to stop button click');
    
    // Read the current recording file if it exists
    if (this.currentOutputPath && existsSync(this.currentOutputPath)) {
      try {
        const content = require('fs').readFileSync(this.currentOutputPath, 'utf-8');
        const actionCount = this.countPlaywrightActions(content);
        
        // Store recording data
        this.lastRecordingData = {
          path: this.currentOutputPath,
          actionCount,
          timestamp: Date.now(),
          specCode: content,
          recordingStopped: true,
          screenshotPath: this.screenshotPath,
          stoppedByButton: true
        };
        
        // Notify UI immediately - show "Begin Analysis" button
        this.electronWindow.webContents.send('recording-complete', {
          ...this.lastRecordingData,
          sessionId
        });
        
        console.log('[Recording] UI notified - Begin Analysis button should be available');
      } catch (error) {
        console.error('[Recording] Failed to read recording file:', error);
      }
    }
  }

  /**
   * Handle recorder closed
   */
  private async handleRecorderClosed(): Promise<void> {
    // If stop button was clicked, we've already handled everything
    if (this.stopButtonClicked) {
      console.log('[Recorder] Process closed after stop button click - already handled');
      this.cleanup();
      return;
    }
    
    if (!this.currentOutputPath) {
      this.cleanup();
      // Notify UI that recorder exited without recording
      this.electronWindow.webContents.send('recorder-exit', { hasRecording: false });
      return;
    }

    try {
      console.log('Checking for recording file (browser closed without stop button):', this.currentOutputPath);
      
      // Wait longer for file to be written by Playwright
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Capture screenshot of final state for validation
      let screenshotPath: string | undefined;
      try {
        const sessionId = path.basename(this.currentOutputPath, '.spec.ts');
        screenshotPath = path.join(this.recordingsDir, `${sessionId}-success.png`);
        
        // Get the active tab manager to capture screenshot
        const { getTabManager } = await import('./main');
        const tabManager = getTabManager();
        
        if (tabManager) {
          const activeTab = tabManager.getActiveTab();
          if (activeTab?.view) {
            console.log('Capturing success state screenshot...');
            const screenshot = await activeTab.view.webContents.capturePage();
            await fs.writeFile(screenshotPath, screenshot.toPNG());
            console.log('Success screenshot saved:', screenshotPath);
          }
        }
      } catch (screenshotError) {
        console.error('Failed to capture success screenshot:', screenshotError);
        screenshotPath = undefined;
      }
      
      // First check if the exact file was created
      let recordingFilePath = this.currentOutputPath;
      let fileExists = existsSync(recordingFilePath);
      
      // If not found, look for any new recording file in the directory
      if (!fileExists) {
        console.log('Exact file not found, scanning for any new recording files...');
        const files = await fs.readdir(this.recordingsDir);
        const recordingFiles = files.filter(f => f.startsWith('recording-') && f.endsWith('.spec.ts'));
        
        if (recordingFiles.length > 0) {
          // Sort by name (which includes timestamp) and get the most recent
          recordingFiles.sort();
          const mostRecentFile = recordingFiles[recordingFiles.length - 1];
          recordingFilePath = path.join(this.recordingsDir, mostRecentFile);
          fileExists = true;
          console.log('Found recording file:', recordingFilePath);
        }
      }
      
      // Check if file was created
      if (fileExists) {
        console.log('Recording file found:', recordingFilePath);
        const stats = await fs.stat(recordingFilePath);
        
        if (stats.size > 0) {
          // Read the final recording
          const specCode = await fs.readFile(recordingFilePath, 'utf8');
          
          // Store last recording data for retrieval
          this.lastRecordingData = {
            path: recordingFilePath,
            specCode,
            sessionId: path.basename(recordingFilePath, '.spec.ts'),
            timestamp: Date.now()
          };
          
          // Notify UI with the complete recording
          this.electronWindow.webContents.send('recording-complete', {
            path: recordingFilePath,
            specCode,
            sessionId: path.basename(recordingFilePath, '.spec.ts')
          });
          
          // Also send recorder exit with recording flag
          this.electronWindow.webContents.send('recorder-exit', { hasRecording: true });
          
          console.log('Recording saved successfully:', this.currentOutputPath);
        } else {
          console.log('Recording file is empty, user may have cancelled');
          this.electronWindow.webContents.send('recording-cancelled', {
            reason: 'Empty recording file'
          });
          this.electronWindow.webContents.send('recorder-exit', { hasRecording: false });
        }
      } else {
        console.log('No recording file created, user cancelled');
        this.electronWindow.webContents.send('recording-cancelled', {
          reason: 'No recording file created'
        });
        this.electronWindow.webContents.send('recorder-exit', { hasRecording: false });
      }
    } catch (error) {
      console.error('Error processing recording:', error);
      this.electronWindow.webContents.send('recorder-exit', { hasRecording: false });
    } finally {
      this.cleanup();
    }
  }

  /**
   * Import an existing recording file
   */
  public async importRecording(filePath: string): Promise<{ 
    success: boolean; 
    specCode?: string; 
    error?: string 
  }> {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const specCode = await fs.readFile(filePath, 'utf8');
      
      // Copy to recordings directory with timestamp
      const sessionId = `imported-${Date.now()}`;
      const newPath = path.join(this.recordingsDir, `${sessionId}.spec.ts`);
      await fs.writeFile(newPath, specCode, 'utf8');

      return { success: true, specCode };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to import recording' 
      };
    }
  }

  /**
   * Get recording status
   */
  public isRecording(): boolean {
    return this.codegenProcess !== null && !this.codegenProcess.killed;
  }
  
  /**
   * Get last recording data
   */
  public getLastRecording(): any {
    return this.lastRecordingData;
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    
    // Close CDP browser connection
    if (this.cdpBrowser) {
      this.cdpBrowser.close().catch(err => {
        console.error('[CDP] Error closing browser connection:', err);
      });
      this.cdpBrowser = null;
      this.cdpPage = null;
    }
    
    if (this.codegenProcess && !this.codegenProcess.killed) {
      this.codegenProcess.kill();
    }
    
    this.codegenProcess = null;
    this.currentOutputPath = null;
    this.isRecordingActive = false;
    this.stopButtonClicked = false;
    this.screenshotPath = null;
  }

  /**
   * Dispose
   */
  public async dispose(): Promise<void> {
    this.cleanup();
  }
}