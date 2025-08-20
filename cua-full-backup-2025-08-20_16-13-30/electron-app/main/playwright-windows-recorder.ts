import { BrowserWindow, app } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Windows-specific Playwright Recorder with native window embedding
 * Uses Win32 API to seamlessly embed Playwright browser into Electron window
 */
export class PlaywrightWindowsRecorder {
  private electronWindow: BrowserWindow;
  private playwrightBrowser: Browser | null = null;
  private playwrightContext: BrowserContext | null = null;
  private playwrightPage: Page | null = null;
  private playwrightWindowHandle: string | null = null;
  private isRecording = false;
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private currentSession: any = null;
  private recordedActions: any[] = [];
  private embedCheckInterval: NodeJS.Timer | null = null;

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
   * Start recording with embedded Playwright browser
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

      // Get Electron window bounds for proper sizing
      const bounds = this.electronWindow.getContentBounds();
      const sidebarWidth = 320;
      const tabbarHeight = 40;
      const viewWidth = bounds.width - sidebarWidth;
      const viewHeight = bounds.height - tabbarHeight;

      // Launch Playwright with a unique window title for identification
      const windowTitle = `PlaywrightRecorder_${sessionId}`;
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          `--window-name=${windowTitle}`,
          '--window-position=0,0',  // Will be repositioned via Win32
          `--window-size=${viewWidth},${viewHeight}`,
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--user-data-dir=' + path.join(process.cwd(), 'playwright-profile'),
        ]
      });

      // Create context with recording enabled
      this.playwrightContext = await this.playwrightBrowser.newContext({
        viewport: { width: viewWidth, height: viewHeight },
        recordVideo: {
          dir: this.recordingsDir,
          size: { width: viewWidth, height: viewHeight }
        }
      });

      // Start tracing for full codegen
      await this.playwrightContext.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      // Create page
      this.playwrightPage = await this.playwrightContext.newPage();
      
      // Set up comprehensive action recording
      await this.setupActionRecording();

      // Navigate to start URL
      if (startUrl) {
        await this.playwrightPage.goto(startUrl);
      }

      // Wait a moment for window to be created
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Embed the Playwright window into Electron
      const embedded = await this.embedPlaywrightWindow(windowTitle, sidebarWidth, tabbarHeight);
      
      if (!embedded) {
        console.warn('Failed to embed window, but recording will continue');
      }

      // Hide Electron's WebContentsView to avoid conflicts
      this.electronWindow.webContents.send('hide-webview-for-recording');

      this.isRecording = true;
      console.log(`Windows-embedded recording started for session: ${sessionId}`);
      
      // Notify UI that recording has started
      this.electronWindow.webContents.send('recording-started', { 
        sessionId,
        mode: 'windows-embedded' 
      });

      return true;

    } catch (error) {
      console.error('Failed to start Windows-embedded recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Set up comprehensive action recording
   */
  private async setupActionRecording(): Promise<void> {
    if (!this.playwrightPage) return;

    // Clear previous actions
    this.recordedActions = [];

    // Record navigation
    this.playwrightPage.on('framenavigated', (frame) => {
      if (frame === this.playwrightPage!.mainFrame()) {
        const url = frame.url();
        this.recordedActions.push({
          type: 'navigate',
          url,
          timestamp: Date.now()
        });
        console.log('Recorded navigation to:', url);
      }
    });

    // Record console messages (useful for debugging)
    this.playwrightPage.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        this.recordedActions.push({
          type: 'console',
          level: msg.type(),
          text: msg.text(),
          timestamp: Date.now()
        });
      }
    });

    // Record network requests (form submissions, AJAX)
    this.playwrightPage.on('request', (request) => {
      if (request.method() === 'POST' || request.method() === 'PUT') {
        this.recordedActions.push({
          type: 'network',
          method: request.method(),
          url: request.url(),
          timestamp: Date.now()
        });
      }
    });

    // Inject client-side recorder for detailed DOM interactions
    await this.playwrightPage.addInitScript(() => {
      (window as any).__recordedActions = [];
      
      // Record clicks
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        (window as any).__recordedActions.push({
          type: 'click',
          selector: target.tagName.toLowerCase() + 
                   (target.id ? '#' + target.id : '') +
                   (target.className ? '.' + target.className.split(' ').join('.') : ''),
          text: target.textContent?.substring(0, 50),
          timestamp: Date.now()
        });
      }, true);

      // Record form inputs
      document.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        (window as any).__recordedActions.push({
          type: 'input',
          selector: target.tagName.toLowerCase() + 
                   (target.id ? '#' + target.id : '') +
                   (target.name ? '[name="' + target.name + '"]' : ''),
          value: target.type === 'password' ? '***' : target.value,
          timestamp: Date.now()
        });
      }, true);

      // Record form submissions
      document.addEventListener('submit', (e) => {
        const target = e.target as HTMLFormElement;
        (window as any).__recordedActions.push({
          type: 'submit',
          selector: 'form' + (target.id ? '#' + target.id : ''),
          timestamp: Date.now()
        });
      }, true);
    });
  }

  /**
   * Embed Playwright window into Electron using Win32 API
   */
  private async embedPlaywrightWindow(windowTitle: string, sidebarWidth: number, tabbarHeight: number): Promise<boolean> {
    try {
      // Get Electron window handle
      const electronHandle = this.electronWindow.getNativeWindowHandle();
      const electronHex = electronHandle.toString('hex');
      
      // PowerShell script for Win32 embedding
      const script = `
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Diagnostics;

public class Win32Embed {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    
    [DllImport("user32.dll")]
    public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
    
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, 
        int X, int Y, int cx, int cy, uint uFlags);
    
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
    
    public static IntPtr FindChromiumWindow(string title) {
        // Try multiple times as window creation might be delayed
        for (int i = 0; i < 10; i++) {
            IntPtr hwnd = FindWindow(null, title);
            if (hwnd != IntPtr.Zero) return hwnd;
            
            // Also try Chrome_WidgetWin_1 class
            hwnd = FindWindow("Chrome_WidgetWin_1", title);
            if (hwnd != IntPtr.Zero) return hwnd;
            
            Thread.Sleep(500);
        }
        return IntPtr.Zero;
    }
}
"@

try {
    # Find Playwright window (try multiple times)
    $playwrightWindow = [Win32Embed]::FindChromiumWindow("${windowTitle}")
    
    if ($playwrightWindow -eq [IntPtr]::Zero) {
        Write-Output "ERROR: Playwright window not found after multiple attempts"
        exit 1
    }
    
    Write-Output "Found Playwright window: $playwrightWindow"
    
    # Get Electron window handle
    $electronWindow = [IntPtr]"0x${electronHex}"
    Write-Output "Electron window handle: $electronWindow"
    
    # Window style constants
    $GWL_STYLE = -16
    $GWL_EXSTYLE = -20
    $WS_CHILD = 0x40000000
    $WS_VISIBLE = 0x10000000
    $WS_POPUP = 0x80000000
    $WS_CAPTION = 0x00C00000
    $WS_THICKFRAME = 0x00040000
    $WS_SYSMENU = 0x00080000
    $WS_MAXIMIZEBOX = 0x00010000
    $WS_MINIMIZEBOX = 0x00020000
    $WS_EX_APPWINDOW = 0x00040000
    $WS_EX_WINDOWEDGE = 0x00000100
    
    # Remove window decorations from Playwright window
    $style = [Win32Embed]::GetWindowLong($playwrightWindow, $GWL_STYLE)
    $newStyle = ($style -band -bnot ($WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU -bor $WS_MAXIMIZEBOX -bor $WS_MINIMIZEBOX)) -bor $WS_CHILD -bor $WS_VISIBLE
    [Win32Embed]::SetWindowLong($playwrightWindow, $GWL_STYLE, $newStyle)
    
    # Remove extended window styles
    $exStyle = [Win32Embed]::GetWindowLong($playwrightWindow, $GWL_EXSTYLE)
    $newExStyle = $exStyle -band -bnot ($WS_EX_APPWINDOW -bor $WS_EX_WINDOWEDGE)
    [Win32Embed]::SetWindowLong($playwrightWindow, $GWL_EXSTYLE, $newExStyle)
    
    # Set Electron as parent
    $result = [Win32Embed]::SetParent($playwrightWindow, $electronWindow)
    if ($result -eq [IntPtr]::Zero) {
        Write-Output "ERROR: Failed to set parent window"
        exit 1
    }
    
    # Get Electron client area
    $rect = New-Object Win32Embed+RECT
    [Win32Embed]::GetClientRect($electronWindow, [ref]$rect) | Out-Null
    
    # Calculate position (accounting for sidebar and tabbar)
    $x = ${sidebarWidth}
    $y = ${tabbarHeight}
    $width = $rect.Right - $rect.Left - ${sidebarWidth}
    $height = $rect.Bottom - $rect.Top - ${tabbarHeight}
    
    # Position the embedded window
    $SWP_FRAMECHANGED = 0x0020
    $SWP_NOZORDER = 0x0004
    $SWP_NOACTIVATE = 0x0010
    
    [Win32Embed]::MoveWindow($playwrightWindow, $x, $y, $width, $height, $true) | Out-Null
    [Win32Embed]::SetWindowPos($playwrightWindow, [IntPtr]::Zero, $x, $y, $width, $height, $SWP_FRAMECHANGED -bor $SWP_NOZORDER) | Out-Null
    
    # Show the window
    [Win32Embed]::ShowWindow($playwrightWindow, 5) | Out-Null # SW_SHOW
    
    Write-Output "SUCCESS: Embedded Playwright window at position ($x, $y) with size ($width x $height)"
    Write-Output "HANDLE:$playwrightWindow"
    
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
`;

      // Execute PowerShell script
      const { stdout, stderr } = await execAsync(
        `powershell -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`
      );
      
      console.log('Embedding output:', stdout);
      if (stderr) console.error('Embedding error:', stderr);
      
      // Extract window handle from output
      const handleMatch = stdout.match(/HANDLE:(\d+)/);
      if (handleMatch) {
        this.playwrightWindowHandle = handleMatch[1];
        console.log('Playwright window handle:', this.playwrightWindowHandle);
      }
      
      // Check if embedding was successful
      if (stdout.includes('SUCCESS:')) {
        // Set up periodic position adjustment
        this.setupWindowTracking();
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('Failed to embed Windows window:', error);
      return false;
    }
  }

  /**
   * Set up window tracking to maintain proper positioning
   */
  private setupWindowTracking(): void {
    // Track Electron window events
    this.electronWindow.on('resize', () => {
      this.adjustEmbeddedWindow();
    });
    
    this.electronWindow.on('move', () => {
      // Embedded window moves with parent automatically
    });
    
    this.electronWindow.on('minimize', () => {
      // Embedded window minimizes with parent automatically
    });
    
    this.electronWindow.on('restore', () => {
      this.adjustEmbeddedWindow();
    });
    
    this.electronWindow.on('focus', () => {
      this.focusPlaywrightWindow();
    });
  }

  /**
   * Adjust embedded window size when Electron window resizes
   */
  private async adjustEmbeddedWindow(): Promise<void> {
    if (!this.playwrightWindowHandle || !this.isRecording) return;
    
    try {
      const bounds = this.electronWindow.getContentBounds();
      const sidebarWidth = 320;
      const tabbarHeight = 40;
      const width = bounds.width - sidebarWidth;
      const height = bounds.height - tabbarHeight;
      
      const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class Win32Resize {
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
}
"@

$hwnd = [IntPtr]${this.playwrightWindowHandle}
[Win32Resize]::MoveWindow($hwnd, ${sidebarWidth}, ${tabbarHeight}, ${width}, ${height}, $true)
Write-Output "Resized to ${width}x${height}"
`;

      await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`);
      
    } catch (error) {
      console.warn('Failed to adjust embedded window:', error);
    }
  }

  /**
   * Focus the Playwright window
   */
  private async focusPlaywrightWindow(): Promise<void> {
    if (!this.playwrightPage || !this.isRecording) return;
    
    try {
      await this.playwrightPage.bringToFront();
    } catch (error) {
      console.warn('Failed to focus Playwright window:', error);
    }
  }

  /**
   * Stop recording and generate comprehensive output
   */
  public async stopRecording(): Promise<any> {
    if (!this.isRecording || !this.currentSession || !this.playwrightContext || !this.playwrightPage) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      this.currentSession.endTime = Date.now();
      const sessionId = this.currentSession.id;
      
      // Get client-side recorded actions
      const clientActions = await this.playwrightPage.evaluate(() => {
        return (window as any).__recordedActions || [];
      });
      
      // Merge all recorded actions
      const allActions = [...this.recordedActions, ...clientActions].sort((a, b) => a.timestamp - b.timestamp);
      
      // Stop tracing and save
      const tracePath = path.join(this.recordingsDir, `${sessionId}-trace.zip`);
      await this.playwrightContext.tracing.stop({ path: tracePath });
      
      // Take final screenshot
      const screenshotPath = path.join(this.recordingsDir, `${sessionId}-final.png`);
      await this.playwrightPage.screenshot({ 
        path: screenshotPath,
        fullPage: true 
      });
      
      // Get current URL
      const finalUrl = this.playwrightPage.url();
      
      // Generate Playwright test code
      const testCode = await this.generateEnhancedTestCode(allActions, sessionId, finalUrl);
      
      // Save test file
      const specPath = path.join(this.recordingsDir, `${sessionId}-test.spec.ts`);
      await fs.writeFile(specPath, testCode, 'utf8');
      
      // Create metadata
      const metadata = {
        sessionId,
        startUrl: this.currentSession.url,
        finalUrl,
        startTime: this.currentSession.startTime,
        endTime: this.currentSession.endTime,
        duration: this.currentSession.endTime - this.currentSession.startTime,
        actionCount: allActions.length,
        tracePath,
        screenshotPath,
        specPath,
        recordingMode: 'windows-embedded'
      };
      
      const metadataPath = path.join(this.recordingsDir, `${sessionId}-metadata.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      
      // Clean up
      await this.cleanup();
      
      // Show Electron's WebContentsView again
      this.electronWindow.webContents.send('show-webview-after-recording');
      
      // Notify UI that recording has stopped
      this.electronWindow.webContents.send('recording-stopped', {
        ...metadata,
        actions: allActions
      });
      
      console.log(`Windows-embedded recording stopped. Generated ${specPath}`);
      
      return {
        session: metadata,
        specCode: testCode,
        screenshotPath,
        metadataPath,
        actions: allActions
      };
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      await this.cleanup();
      return null;
    }
  }

  /**
   * Generate enhanced Playwright test code
   */
  private async generateEnhancedTestCode(actions: any[], sessionId: string, finalUrl: string): Promise<string> {
    const startUrl = this.currentSession.url;
    
    // Group actions by type for better code generation
    const navigations = actions.filter(a => a.type === 'navigate');
    const clicks = actions.filter(a => a.type === 'click');
    const inputs = actions.filter(a => a.type === 'input');
    const submits = actions.filter(a => a.type === 'submit');
    
    // Generate action code
    const actionCode = actions.map(action => {
      switch(action.type) {
        case 'navigate':
          return `  await page.goto('${action.url}');`;
        case 'click':
          return `  await page.click('${action.selector}'); // ${action.text || 'Click element'}`;
        case 'input':
          const value = action.value === '***' ? '{{PASSWORD}}' : action.value;
          return `  await page.fill('${action.selector}', '${value}');`;
        case 'submit':
          return `  await page.locator('${action.selector}').submit();`;
        default:
          return `  // ${action.type}: ${JSON.stringify(action)}`;
      }
    }).join('\n');
    
    return `import { test, expect } from '@playwright/test';

test('Windows Embedded Recording - ${sessionId}', async ({ page }) => {
  // Test generated from Windows-embedded Playwright recording
  // Total actions recorded: ${actions.length}
  
  // Navigate to start URL
  await page.goto('${startUrl}');
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Recorded user actions
${actionCode}
  
  // Verify final state
  await expect(page).toHaveURL('${finalUrl}');
});

/*
 * Recording Metadata:
 * Session ID: ${sessionId}
 * Start URL: ${startUrl}
 * Final URL: ${finalUrl}
 * Duration: ${Math.round((this.currentSession.endTime - this.currentSession.startTime) / 1000)}s
 * Actions: ${actions.length} (${navigations.length} navigations, ${clicks.length} clicks, ${inputs.length} inputs)
 * Recording Mode: Windows Native Embedding
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
      // Close Playwright resources
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
    
    // Clear references
    this.playwrightPage = null;
    this.playwrightContext = null;
    this.playwrightBrowser = null;
    this.playwrightWindowHandle = null;
    this.currentSession = null;
    this.recordedActions = [];
  }

  /**
   * Get recording status
   */
  public getRecordingStatus(): { 
    isRecording: boolean; 
    sessionId?: string; 
    startTime?: number;
    actionCount?: number;
  } {
    return {
      isRecording: this.isRecording,
      sessionId: this.currentSession?.id,
      startTime: this.currentSession?.startTime,
      actionCount: this.recordedActions.length
    };
  }

  /**
   * Dispose of all resources
   */
  public async dispose(): Promise<void> {
    await this.cleanup();
  }
}