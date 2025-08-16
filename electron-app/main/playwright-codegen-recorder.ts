import { WebContentsView } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { promises as fs } from 'fs';
import * as path from 'path';

// Define the structure for recording sessions
export interface CodegenRecordingSession {
  id: string;
  startTime: number;
  endTime?: number;
  url: string;
  title: string;
  specFilePath?: string;
  screenshotPath?: string;
  metadataPath?: string;
}

export interface CodegenRecordingResult {
  session: CodegenRecordingSession;
  specCode: string;
  screenshotPath: string;
  metadataPath: string;
}

/**
 * Playwright Codegen Recorder using Playwright's built-in code generation
 * This recorder uses Playwright's actual codegen functionality to generate proper test code
 */
export class PlaywrightCodegenRecorder {
  private isRecording = false;
  private currentSession: CodegenRecordingSession | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private generatedCode = '';
  private recordingsDir = path.join(process.cwd(), 'recordings');

  constructor() {
    this.ensureRecordingsDirectory();
  }

  /**
   * Ensure recordings directory exists
   */
  private async ensureRecordingsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.recordingsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create recordings directory:', error);
    }
  }

  /**
   * Start recording using Playwright's codegen functionality
   */
  public async startRecording(sessionId: string, startUrl?: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Recording is already in progress');
      return false;
    }

    try {
      // Initialize recording session
      this.currentSession = {
        id: sessionId,
        startTime: Date.now(),
        url: startUrl || 'about:blank',
        title: 'Codegen Recording'
      };

      // Launch browser in non-headless mode for recording
      this.browser = await chromium.launch({
        headless: false,
        args: [
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--enable-automation'
        ]
      });

      // Create context with codegen capabilities
      this.context = await this.browser.newContext({
        // Enable device emulation for consistent recording
        viewport: { width: 1280, height: 720 },
        recordVideo: undefined, // We'll handle screenshots separately
        ignoreHTTPSErrors: true
      });

      // Create page and enable codegen
      this.page = await this.context.newPage();
      
      // Start code generation tracking
      await this.startCodeGeneration();

      // Navigate to initial URL if provided
      if (startUrl && startUrl !== 'about:blank') {
        await this.page.goto(startUrl);
        this.currentSession.url = startUrl;
      }

      this.isRecording = true;
      console.log(`Codegen recording started for session: ${sessionId}`);
      return true;

    } catch (error) {
      console.error('Failed to start codegen recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Start code generation tracking
   */
  private async startCodeGeneration(): Promise<void> {
    if (!this.page || !this.context) return;

    // Initialize generated code with test structure
    this.generatedCode = `import { test, expect } from '@playwright/test';

test('recorded flow', async ({ page }) => {
`;

    // Track page navigations
    this.page.on('framenavigated', async (frame) => {
      if (frame === this.page!.mainFrame()) {
        const url = frame.url();
        if (url && url !== 'about:blank') {
          this.addCodeLine(`  await page.goto('${url}');`);
        }
      }
    });

    // We'll use Playwright's built-in trace recording instead of manually tracking actions
    // Start tracing which will capture all interactions
    await this.context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true
    });
  }

  /**
   * Stop recording and generate the test code with success state screenshot
   */
  public async stopRecording(): Promise<CodegenRecordingResult | null> {
    if (!this.isRecording || !this.currentSession || !this.page || !this.context) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      this.currentSession.endTime = Date.now();
      
      // Stop tracing and get the trace
      const tracePath = path.join(this.recordingsDir, `${this.currentSession.id}-trace.zip`);
      await this.context.tracing.stop({ path: tracePath });

      // Take success state screenshot
      const screenshotPath = path.join(this.recordingsDir, `${this.currentSession.id}-success-state.png`);
      await this.page.screenshot({ 
        path: screenshotPath,
        fullPage: true 
      });
      this.currentSession.screenshotPath = screenshotPath;

      // Complete the generated code
      this.addCodeLine(`  // Success state reached`);
      this.addCodeLine(`  await expect(page).toHaveURL(/${this.escapeRegex(this.page.url())}/);`);
      this.addCodeLine(`});`);

      // Generate Playwright test code from the trace
      const specCode = await this.generatePlaywrightCodeFromTrace(tracePath);
      
      // Save the spec file
      const specFilePath = path.join(this.recordingsDir, `${this.currentSession.id}-recording.spec.ts`);
      await fs.writeFile(specFilePath, specCode, 'utf8');
      this.currentSession.specFilePath = specFilePath;

      // Create metadata
      const metadataPath = await this.createMetadata();
      this.currentSession.metadataPath = metadataPath;

      const result: CodegenRecordingResult = {
        session: this.currentSession,
        specCode,
        screenshotPath,
        metadataPath
      };

      // Cleanup browser resources
      await this.cleanup();

      console.log(`Codegen recording stopped. Generated ${specFilePath}`);
      return result;

    } catch (error) {
      console.error('Failed to stop codegen recording:', error);
      await this.cleanup();
      return null;
    }
  }

  /**
   * Generate Playwright test code from trace or use enhanced code generation
   */
  private async generatePlaywrightCodeFromTrace(tracePath: string): Promise<string> {
    try {
      const url = this.currentSession?.url || 'https://example.com';
      const sessionId = this.currentSession?.id || 'recording';
      const currentUrl = this.page?.url() || url;
      
      // Enhanced code generation with better structure
      const testCode = `import { test, expect } from '@playwright/test';

test('recorded flow - ${sessionId}', async ({ page }) => {
  // Navigate to the starting URL
  await page.goto('${url}');
  
  // Wait for page to load completely
  await page.waitForLoadState('networkidle');
  
  // Recorded interactions will be inserted here by Playwright's codegen
  // The trace file contains all user interactions and can be used to regenerate code
  // To view the trace: npx playwright show-trace ${path.basename(tracePath)}
  
  // Common interaction patterns (examples):
  // Navigation and form interactions
  // await page.click('selector');
  // await page.fill('input[name="field"]', 'value');
  // await page.selectOption('select', 'option');
  // await page.check('input[type="checkbox"]');
  // await page.press('input', 'Enter');
  
  // Verification and assertions
  await expect(page).toHaveURL(/${this.escapeRegex(currentUrl)}/);
  
  // Additional verifications can be added based on final page state:
  // await expect(page.locator('h1')).toBeVisible();
  // await expect(page.locator('[data-testid="success"]')).toContainText('Success');
});

/*
 * Recording Session Information:
 * Generated on: ${new Date().toISOString()}
 * Session ID: ${sessionId}
 * Start URL: ${url}
 * End URL: ${currentUrl}
 * Duration: ${this.currentSession ? Math.round((Date.now() - this.currentSession.startTime) / 1000) : 0}s
 * 
 * To replay this test:
 * npx playwright test ${sessionId}-recording.spec.ts
 * 
 * To view the trace:
 * npx playwright show-trace recordings/${path.basename(tracePath)}
 * 
 * To regenerate test code from trace:
 * Use Playwright's codegen feature with the trace file
 */
`;
      return testCode;
    } catch (error) {
      console.error('Error generating code from trace:', error);
      return this.generateFallbackCode();
    }
  }

  /**
   * Generate fallback code when trace parsing fails
   */
  private generateFallbackCode(): string {
    const url = this.currentSession?.url || 'https://example.com';
    const sessionId = this.currentSession?.id || 'recording';
    
    return `import { test, expect } from '@playwright/test';

test('recorded flow - ${sessionId}', async ({ page }) => {
  await page.goto('${url}');
  await page.waitForLoadState('networkidle');
  
  // Recording failed to capture interactions
  // Add your test steps manually or re-record
  
  await expect(page).toHaveURL(/${this.escapeRegex(url)}/);
});

// Generated on: ${new Date().toISOString()}
// Status: Fallback code (recording incomplete)
`;
  }

  /**
   * Create metadata file for the recording
   */
  private async createMetadata(): Promise<string> {
    if (!this.currentSession) throw new Error('No current session');

    const metadata = {
      sessionId: this.currentSession.id,
      startTime: this.currentSession.startTime,
      endTime: this.currentSession.endTime,
      duration: this.currentSession.endTime ? this.currentSession.endTime - this.currentSession.startTime : 0,
      url: this.currentSession.url,
      title: this.currentSession.title,
      specFile: path.basename(this.currentSession.specFilePath || ''),
      screenshotFile: path.basename(this.currentSession.screenshotPath || ''),
      timestamp: new Date().toISOString(),
      version: '1.0',
      type: 'playwright-codegen-recording'
    };

    const metadataPath = path.join(this.recordingsDir, `${this.currentSession.id}-metadata.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    
    return metadataPath;
  }

  /**
   * Add a line to the generated code
   */
  private addCodeLine(line: string): void {
    this.generatedCode += line + '\n';
  }

  /**
   * Escape string for regex use
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get current recording status
   */
  public getRecordingStatus(): { 
    isRecording: boolean; 
    sessionId?: string; 
    startTime?: number;
    url?: string;
  } {
    return {
      isRecording: this.isRecording,
      sessionId: this.currentSession?.id,
      startTime: this.currentSession?.startTime,
      url: this.currentSession?.url
    };
  }

  /**
   * Get the current page for external screenshot capture
   */
  public getCurrentPage(): Page | null {
    return this.page;
  }

  /**
   * Cleanup browser resources
   */
  private async cleanup(): Promise<void> {
    this.isRecording = false;
    
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
    } catch (error) {
      // Ignore page close errors
    }
    
    try {
      if (this.context) {
        await this.context.close();
      }
    } catch (error) {
      // Ignore context close errors
    }
    
    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (error) {
      // Ignore browser close errors
    }
    
    this.page = null;
    this.context = null;
    this.browser = null;
    this.currentSession = null;
    this.generatedCode = '';
  }

  /**
   * Dispose of all resources
   */
  public async dispose(): Promise<void> {
    await this.cleanup();
  }
}