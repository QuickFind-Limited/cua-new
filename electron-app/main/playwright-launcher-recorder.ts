import { BrowserWindow, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import * as chokidar from 'chokidar';

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
      
      // Build codegen command
      const args = [
        'codegen',
        '--target=playwright-test',
        `--output=${this.currentOutputPath}`,
        '--viewport-size=1280,800'
      ];
      
      // Add URL if provided
      if (startUrl) {
        args.push(startUrl);
      }

      console.log('Launching Playwright recorder...');
      console.log('Output will be saved to:', this.currentOutputPath);
      
      // Launch playwright codegen
      if (playwrightPath === 'playwright' || playwrightPath.includes('npx')) {
        const [cmd, ...cmdArgs] = playwrightPath.split(' ');
        this.codegenProcess = spawn(cmd, [...cmdArgs, ...args], {
          stdio: 'inherit',
          shell: true
        });
      } else {
        this.codegenProcess = spawn(playwrightPath, args, {
          stdio: 'inherit',
          shell: process.platform === 'win32'
        });
      }

      // Watch for file changes
      this.startFileWatcher();

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
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Count Playwright actions to gauge recording progress
      const actionCount = this.countPlaywrightActions(content);
      
      console.log(`Recording updated: ${actionCount} actions recorded`);
      
      // Notify UI that recording was saved/updated
      this.electronWindow.webContents.send('recording-saved', {
        path: filePath,
        size: stats.size,
        actionCount,
        timestamp: Date.now(),
        specCode: content
      });
    } catch (error) {
      console.error('Error processing file change:', error);
    }
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
   * Handle recorder closed
   */
  private async handleRecorderClosed(): Promise<void> {
    if (!this.currentOutputPath) {
      this.cleanup();
      // Notify UI that recorder exited without recording
      this.electronWindow.webContents.send('recorder-exit', { hasRecording: false });
      return;
    }

    try {
      // Check if file was created
      if (existsSync(this.currentOutputPath)) {
        const stats = await fs.stat(this.currentOutputPath);
        
        if (stats.size > 0) {
          // Read the final recording
          const specCode = await fs.readFile(this.currentOutputPath, 'utf8');
          
          // Store last recording data for retrieval
          this.lastRecordingData = {
            path: this.currentOutputPath,
            specCode,
            sessionId: path.basename(this.currentOutputPath, '.spec.ts'),
            timestamp: Date.now()
          };
          
          // Notify UI with the complete recording
          this.electronWindow.webContents.send('recording-complete', {
            path: this.currentOutputPath,
            specCode,
            sessionId: path.basename(this.currentOutputPath, '.spec.ts')
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
    
    if (this.codegenProcess && !this.codegenProcess.killed) {
      this.codegenProcess.kill();
    }
    
    this.codegenProcess = null;
    this.currentOutputPath = null;
    this.isRecordingActive = false;
  }

  /**
   * Dispose
   */
  public async dispose(): Promise<void> {
    this.cleanup();
  }
}