import { BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';

/**
 * Playwright Codegen External Recorder
 * Uses actual Playwright codegen command for comprehensive recording
 */
export class PlaywrightCodegenExternalRecorder {
  private electronWindow: BrowserWindow;
  private codegenProcess: ChildProcess | null = null;
  private isRecording = false;
  private recordingsDir = path.join(process.cwd(), 'recordings');
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
   * Find Playwright executable
   */
  private findPlaywrightPath(): string | null {
    // Try to find playwright executable
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
   * Start Playwright codegen recording
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

      // Find playwright executable
      const playwrightPath = this.findPlaywrightPath();
      if (!playwrightPath) {
        throw new Error('Playwright executable not found. Please install Playwright.');
      }
      console.log('Using Playwright at:', playwrightPath);

      // Generate output file path
      const outputPath = path.join(this.recordingsDir, `${sessionId}-test.spec.ts`);
      
      // Build codegen command
      const args = [
        'codegen',
        '--target=playwright-test', // Generate Playwright test format
        '--output=' + outputPath,   // Output file
        '--viewport-size=1280,800', // Set viewport
        startUrl || 'https://www.google.com'
      ];

      console.log('Launching Playwright codegen with args:', args);
      
      // Launch playwright codegen
      if (playwrightPath === 'playwright' || playwrightPath.includes('npx')) {
        // Global or npx command
        const [cmd, ...cmdArgs] = playwrightPath.split(' ');
        this.codegenProcess = spawn(cmd, [...cmdArgs, ...args], {
          stdio: 'pipe',
          shell: true
        });
      } else {
        // Direct path to playwright
        this.codegenProcess = spawn(playwrightPath, args, {
          stdio: 'pipe',
          shell: process.platform === 'win32'
        });
      }

      // Handle process output
      this.codegenProcess.stdout?.on('data', (data) => {
        console.log('Codegen stdout:', data.toString());
      });

      this.codegenProcess.stderr?.on('data', (data) => {
        console.error('Codegen stderr:', data.toString());
      });

      // Handle process exit
      this.codegenProcess.on('exit', async (code) => {
        console.log(`Codegen process exited with code ${code}`);
        
        if (this.isRecording) {
          // Process was closed by user, save the recording
          await this.processRecordingComplete(outputPath);
        }
      });

      this.codegenProcess.on('error', (error) => {
        console.error('Codegen process error:', error);
        this.cleanup();
      });

      this.isRecording = true;
      console.log(`Codegen recording started for session: ${sessionId}`);
      
      // Update UI
      this.electronWindow.webContents.send('recording-started', { 
        sessionId,
        mode: 'playwright-codegen',
        instructions: 'Perform your actions in the Chromium window. Close it when done.'
      });

      return true;

    } catch (error) {
      console.error('Failed to start codegen recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Process completed recording
   */
  private async processRecordingComplete(outputPath: string): Promise<void> {
    if (!this.currentSession) return;

    try {
      const sessionId = this.currentSession.id;
      this.currentSession.endTime = Date.now();

      // Check if file was created
      if (existsSync(outputPath)) {
        // Read the generated spec file
        const specCode = await fs.readFile(outputPath, 'utf8');
        console.log(`Recording saved to ${outputPath}`);
        
        // Parse the spec to extract actions
        const actions = this.parsePlaywrightSpec(specCode);
        
        // Create metadata
        const metadata = {
          sessionId,
          startUrl: this.currentSession.url,
          startTime: this.currentSession.startTime,
          endTime: this.currentSession.endTime,
          duration: this.currentSession.endTime - this.currentSession.startTime,
          actionCount: actions.length,
          specPath: outputPath,
          recordingMode: 'playwright-codegen'
        };
        
        const metadataPath = path.join(this.recordingsDir, `${sessionId}-metadata.json`);
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
        
        // Notify UI
        this.electronWindow.webContents.send('recording-stopped', metadata);
        this.electronWindow.webContents.send('codegen-recording-complete', {
          sessionId,
          specCode,
          specPath: outputPath,
          metadata
        });
        
        console.log('Recording complete and saved');
      } else {
        console.warn('Recording file not found:', outputPath);
        this.electronWindow.webContents.send('recording-cancelled', { 
          sessionId: this.currentSession.id,
          reason: 'No recording file generated'
        });
      }
    } catch (error) {
      console.error('Error processing recording:', error);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Parse Playwright spec to extract actions
   */
  private parsePlaywrightSpec(specCode: string): any[] {
    const actions: any[] = [];
    const lines = specCode.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Parse different action types
      if (trimmed.startsWith('await page.goto(')) {
        const urlMatch = trimmed.match(/page\.goto\(['"]([^'"]+)['"]\)/);
        if (urlMatch) {
          actions.push({ type: 'navigate', url: urlMatch[1] });
        }
      } else if (trimmed.startsWith('await page.click(')) {
        const selectorMatch = trimmed.match(/page\.click\(['"]([^'"]+)['"]\)/);
        if (selectorMatch) {
          actions.push({ type: 'click', selector: selectorMatch[1] });
        }
      } else if (trimmed.startsWith('await page.fill(')) {
        const fillMatch = trimmed.match(/page\.fill\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
        if (fillMatch) {
          actions.push({ type: 'fill', selector: fillMatch[1], value: fillMatch[2] });
        }
      } else if (trimmed.startsWith('await page.type(')) {
        const typeMatch = trimmed.match(/page\.type\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
        if (typeMatch) {
          actions.push({ type: 'type', selector: typeMatch[1], value: typeMatch[2] });
        }
      } else if (trimmed.startsWith('await page.selectOption(')) {
        const selectMatch = trimmed.match(/page\.selectOption\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
        if (selectMatch) {
          actions.push({ type: 'select', selector: selectMatch[1], value: selectMatch[2] });
        }
      } else if (trimmed.startsWith('await page.check(')) {
        const checkMatch = trimmed.match(/page\.check\(['"]([^'"]+)['"]\)/);
        if (checkMatch) {
          actions.push({ type: 'check', selector: checkMatch[1] });
        }
      } else if (trimmed.startsWith('await page.uncheck(')) {
        const uncheckMatch = trimmed.match(/page\.uncheck\(['"]([^'"]+)['"]\)/);
        if (uncheckMatch) {
          actions.push({ type: 'uncheck', selector: uncheckMatch[1] });
        }
      } else if (trimmed.startsWith('await page.press(')) {
        const pressMatch = trimmed.match(/page\.press\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
        if (pressMatch) {
          actions.push({ type: 'press', selector: pressMatch[1], key: pressMatch[2] });
        }
      }
    }
    
    return actions;
  }

  /**
   * Stop recording
   */
  public async stopRecording(): Promise<any> {
    if (!this.isRecording || !this.currentSession) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      const sessionId = this.currentSession.id;
      const outputPath = path.join(this.recordingsDir, `${sessionId}-test.spec.ts`);
      
      // Kill the codegen process if still running
      if (this.codegenProcess && !this.codegenProcess.killed) {
        console.log('Stopping codegen process...');
        this.codegenProcess.kill();
        
        // Wait a bit for file to be written
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Process the recording
      await this.processRecordingComplete(outputPath);
      
      // Read the generated spec file if it exists
      if (existsSync(outputPath)) {
        const specCode = await fs.readFile(outputPath, 'utf8');
        const metadataPath = path.join(this.recordingsDir, `${sessionId}-metadata.json`);
        
        return {
          session: {
            sessionId,
            specFilePath: outputPath,
            metadataPath
          },
          specCode,
          specPath: outputPath,
          metadataPath
        };
      } else {
        console.warn('No recording file found after stopping');
        return null;
      }
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      await this.cleanup();
      return null;
    }
  }

  /**
   * Clean up
   */
  private async cleanup(): Promise<void> {
    this.isRecording = false;
    
    try {
      if (this.codegenProcess && !this.codegenProcess.killed) {
        this.codegenProcess.kill();
      }
    } catch (error) {
      console.warn('Error killing codegen process:', error);
    }
    
    this.codegenProcess = null;
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
      mode: 'playwright-codegen'
    };
  }

  public async dispose(): Promise<void> {
    await this.cleanup();
  }
}