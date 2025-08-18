import { WebContentsView, ipcMain } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

/**
 * Magnitude WebView Controller
 * Controls the existing Electron WebContentsView using Playwright via CDP
 */
export class MagnitudeWebViewController {
  private webView: WebContentsView | null = null;
  private playwrightBrowser: Browser | null = null;
  private playwrightPage: Page | null = null;
  private cdpPort: number = 9222;
  private isConnected = false;

  /**
   * Connect Playwright to existing WebContentsView via CDP
   */
  public async connectToWebView(webView: WebContentsView): Promise<boolean> {
    try {
      this.webView = webView;
      
      // Enable remote debugging on the WebContents
      const webContents = webView.webContents;
      
      // Attach debugger to enable CDP
      try {
        webContents.debugger.attach('1.3');
        console.log('Debugger attached to WebContentsView');
      } catch (err) {
        console.log('Debugger already attached or error:', err);
      }

      // Get the WebSocket debugger URL
      const debuggerUrl = await this.getDebuggerUrl(webContents);
      
      if (!debuggerUrl) {
        console.error('Could not get debugger URL from WebContents');
        return false;
      }

      // Connect Playwright via CDP
      console.log('Connecting Playwright to WebContentsView via CDP...');
      this.playwrightBrowser = await chromium.connectOverCDP(debuggerUrl);
      
      // Get the existing context and page
      const contexts = this.playwrightBrowser.contexts();
      if (contexts.length > 0) {
        const context = contexts[0];
        const pages = context.pages();
        
        if (pages.length > 0) {
          this.playwrightPage = pages[0];
          console.log('Connected to existing page:', await this.playwrightPage.url());
        } else {
          // Create a new page in the existing context
          this.playwrightPage = await context.newPage();
          console.log('Created new page in existing context');
        }
      } else {
        console.error('No contexts found in connected browser');
        return false;
      }

      this.isConnected = true;
      console.log('Successfully connected Playwright to WebContentsView');
      return true;

    } catch (error) {
      console.error('Failed to connect to WebContentsView:', error);
      return false;
    }
  }

  /**
   * Get debugger URL from WebContents
   */
  private async getDebuggerUrl(webContents: any): Promise<string | null> {
    return new Promise((resolve) => {
      // Try to get the debugger URL directly
      const processId = webContents.getOSProcessId();
      const webContentsId = webContents.id;
      
      // Construct the CDP URL
      // Note: This might need adjustment based on Electron version
      const cdpUrl = `ws://127.0.0.1:${this.cdpPort}/devtools/page/${webContentsId}`;
      
      // Alternative: Try to get URL from webContents debugger
      try {
        // Send a CDP command to test connection
        webContents.debugger.sendCommand('Runtime.evaluate', {
          expression: '1+1'
        }).then(() => {
          console.log('CDP connection verified');
          resolve(cdpUrl);
        }).catch((err: any) => {
          console.error('CDP test failed:', err);
          // Try alternative URL format
          resolve(`http://127.0.0.1:${this.cdpPort}`);
        });
      } catch (error) {
        console.error('Failed to get debugger URL:', error);
        resolve(null);
      }
    });
  }

  /**
   * Execute Intent Spec step on the WebView
   */
  public async executeStep(step: any, variables: Record<string, string> = {}): Promise<{
    success: boolean;
    error?: string;
    data?: any;
  }> {
    if (!this.isConnected || !this.playwrightPage) {
      return { 
        success: false, 
        error: 'Not connected to WebView. Call connectToWebView first.' 
      };
    }

    try {
      // Replace variables in the snippet
      let snippet = step.snippet || '';
      for (const [key, value] of Object.entries(variables)) {
        snippet = snippet.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      console.log(`Executing step: ${step.name}`);
      console.log(`Snippet: ${snippet}`);

      // Execute the Playwright snippet
      // We need to evaluate it in the context of the page
      const result = await this.evaluateSnippet(snippet);
      
      return { success: true, data: result };

    } catch (error) {
      console.error('Step execution failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Step execution failed' 
      };
    }
  }

  /**
   * Evaluate Playwright snippet
   */
  private async evaluateSnippet(snippet: string): Promise<any> {
    if (!this.playwrightPage) {
      throw new Error('Page not available');
    }

    const page = this.playwrightPage;
    
    // Parse and execute common Playwright commands
    if (snippet.includes('page.goto')) {
      const urlMatch = snippet.match(/page\.goto\(['"]([^'"]+)['"]\)/);
      if (urlMatch) {
        return await page.goto(urlMatch[1]);
      }
    }
    
    if (snippet.includes('page.click')) {
      const selectorMatch = snippet.match(/page\.click\(['"]([^'"]+)['"]\)/);
      if (selectorMatch) {
        return await page.click(selectorMatch[1]);
      }
    }
    
    if (snippet.includes('page.fill')) {
      const match = snippet.match(/page\.fill\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
      if (match) {
        return await page.fill(match[1], match[2]);
      }
    }
    
    if (snippet.includes('page.getByRole')) {
      // Handle modern selectors
      const match = snippet.match(/page\.getByRole\(['"](\w+)['"],\s*{([^}]+)}\)/);
      if (match) {
        const role = match[1];
        const optionsStr = match[2];
        const nameMatch = optionsStr.match(/name:\s*['"]([^'"]+)['"]/);
        
        if (nameMatch) {
          const locator = page.getByRole(role as any, { name: nameMatch[1] });
          
          // Check what action to perform
          if (snippet.includes('.click()')) {
            return await locator.click();
          } else if (snippet.includes('.fill(')) {
            const valueMatch = snippet.match(/\.fill\(['"]([^'"]+)['"]\)/);
            if (valueMatch) {
              return await locator.fill(valueMatch[1]);
            }
          }
        }
      }
    }
    
    if (snippet.includes('page.waitForSelector')) {
      const match = snippet.match(/page\.waitForSelector\(['"]([^'"]+)['"]/);
      if (match) {
        return await page.waitForSelector(match[1]);
      }
    }
    
    // For other commands, try to evaluate directly
    // This is less safe but allows for more flexibility
    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const func = new AsyncFunction('page', snippet);
      return await func(page);
    } catch (error) {
      console.error('Failed to evaluate snippet:', error);
      throw error;
    }
  }

  /**
   * Execute complete Intent Spec flow
   */
  public async executeFlow(
    intentSpec: any, 
    variables: Record<string, string> = {}
  ): Promise<{
    success: boolean;
    results: any[];
    errors: string[];
  }> {
    const results: any[] = [];
    const errors: string[] = [];
    
    if (!this.isConnected) {
      return { 
        success: false, 
        results: [], 
        errors: ['Not connected to WebView'] 
      };
    }

    console.log(`Executing flow: ${intentSpec.name}`);
    
    // Navigate to start URL if specified
    if (intentSpec.url && this.playwrightPage) {
      try {
        await this.playwrightPage.goto(intentSpec.url);
        results.push({ step: 'navigation', success: true });
      } catch (error) {
        errors.push(`Navigation failed: ${error}`);
      }
    }

    // Execute each step
    for (const step of intentSpec.steps || []) {
      const stepResult = await this.executeStep(step, variables);
      
      results.push({
        step: step.name,
        success: stepResult.success,
        error: stepResult.error,
        data: stepResult.data
      });
      
      if (!stepResult.success) {
        errors.push(`Step "${step.name}" failed: ${stepResult.error}`);
        
        // Check if we should continue on failure
        if (step.continueOnFailure !== true) {
          break;
        }
      }
      
      // Add a small delay between steps to avoid overwhelming the page
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      success: errors.length === 0,
      results,
      errors
    };
  }

  /**
   * Disconnect from WebView
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.playwrightBrowser) {
        await this.playwrightBrowser.close();
      }
      
      if (this.webView?.webContents.debugger.isAttached()) {
        this.webView.webContents.debugger.detach();
      }
    } catch (error) {
      console.error('Error during disconnect:', error);
    } finally {
      this.playwrightBrowser = null;
      this.playwrightPage = null;
      this.webView = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if connected
   */
  public getIsConnected(): boolean {
    return this.isConnected;
  }
}