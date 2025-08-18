import { BrowserWindow, ipcMain } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Windows Recorder with Hidden Electron UI
 * Hides Electron tabbar during recording, uses Chromium's native tabs
 * This provides the cleanest user experience for multi-tab recording
 */
export class PlaywrightWindowsHideUIRecorder {
  private electronWindow: BrowserWindow;
  private playwrightBrowser: Browser | null = null;
  private playwrightContext: BrowserContext | null = null;
  private isRecording = false;
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private chromiumWindowHandle: string | null = null;
  private recordedTabs = new Map<string, any>();
  private currentSession: any = null;

  constructor(electronWindow: BrowserWindow) {
    this.electronWindow = electronWindow;
    this.ensureRecordingsDirectory();
    this.setupIpcHandlers();
  }

  private async ensureRecordingsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.recordingsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create recordings directory:', error);
    }
  }

  private setupIpcHandlers(): void {
    // Handle UI state changes
    ipcMain.on('tabbar-hidden', () => {
      console.log('Electron tabbar hidden successfully');
    });

    ipcMain.on('tabbar-shown', () => {
      console.log('Electron tabbar restored successfully');
    });
  }

  /**
   * Start recording with hidden Electron UI
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

      // Get window bounds
      const bounds = this.electronWindow.getContentBounds();
      const sidebarWidth = 320;
      
      // IMPORTANT: Hide Electron tabbar first
      console.log('Hiding Electron tabbar for recording...');
      this.electronWindow.webContents.send('hide-tabbar-for-recording');
      
      // Wait for UI to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Calculate dimensions - full height without tabbar
      const viewWidth = bounds.width - sidebarWidth;
      const viewHeight = bounds.height; // Full height - no tabbar
      
      // Launch Chromium with its native tabs visible
      const windowTitle = `PlaywrightRecorder_${sessionId}`;
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          `--window-name=${windowTitle}`,
          '--window-position=0,0',
          `--window-size=${viewWidth},${viewHeight}`,
          '--disable-blink-features=AutomationControlled',
          '--user-data-dir=' + path.join(process.cwd(), 'playwright-profile'),
          // Keep Chromium's native UI
          '--enable-features=TabGroups',
          '--enable-chrome-browser-cloud-management'
        ]
      });

      // Create context with recording capabilities
      this.playwrightContext = await this.playwrightBrowser.newContext({
        viewport: null, // Use natural viewport
        recordVideo: {
          dir: this.recordingsDir,
          size: { width: viewWidth, height: viewHeight }
        },
        acceptDownloads: true,
        ignoreHTTPSErrors: true
      });

      // Start tracing
      await this.playwrightContext.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      // Set up comprehensive tab tracking
      this.setupTabTracking();

      // Create first tab
      const firstPage = await this.playwrightContext.newPage();
      if (startUrl) {
        await firstPage.goto(startUrl);
      }

      // Wait for Chromium window to be created
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Embed Chromium window at position (320, 0) - no tabbar offset
      const embedded = await this.embedChromiumFullHeight(windowTitle, sidebarWidth);
      
      if (!embedded) {
        throw new Error('Failed to embed Chromium window');
      }

      // Hide WebContentsView
      this.electronWindow.webContents.send('hide-webview-for-recording');

      this.isRecording = true;
      console.log(`Recording started with hidden UI for session: ${sessionId}`);
      
      // Update sidebar to show recording status
      this.electronWindow.webContents.send('recording-started', { 
        sessionId,
        mode: 'chromium-tabs',
        instructions: 'Use Chromium tabs: Ctrl+T (new), Ctrl+Tab (switch), Ctrl+W (close)'
      });

      // Update sidebar progress
      this.electronWindow.webContents.send('update-sidebar-progress', {
        step: 'recording',
        status: 'active'
      });

      return true;

    } catch (error) {
      console.error('Failed to start recording:', error);
      await this.cleanup();
      // Restore UI on failure
      this.electronWindow.webContents.send('show-tabbar-after-recording');
      return false;
    }
  }

  /**
   * Set up comprehensive tab tracking
   */
  private setupTabTracking(): void {
    if (!this.playwrightContext) return;

    let tabCounter = 0;
    
    // Track all pages (tabs) created
    this.playwrightContext.on('page', async (page) => {
      const tabId = `tab-${++tabCounter}`;
      const tabInfo = {
        id: tabId,
        page,
        url: page.url(),
        title: '',
        actions: [],
        createdAt: Date.now()
      };
      
      this.recordedTabs.set(tabId, tabInfo);
      
      // Update title when available
      page.once('load', async () => {
        tabInfo.title = await page.title();
        console.log(`Tab ${tabId} loaded: ${tabInfo.title} - ${page.url()}`);
      });
      
      // Track navigation
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          tabInfo.actions.push({
            type: 'navigate',
            url: frame.url(),
            timestamp: Date.now()
          });
          tabInfo.url = frame.url();
        }
      });
      
      // Track when tab is closed
      page.on('close', () => {
        console.log(`Tab ${tabId} closed`);
        tabInfo.actions.push({
          type: 'tab-closed',
          timestamp: Date.now()
        });
      });
      
      // Inject action recorder into page
      page.evaluateOnNewDocument(() => {
        window.__recordedActions = [];
        
        // Record clicks
        document.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          window.__recordedActions.push({
            type: 'click',
            selector: target.tagName.toLowerCase() + 
                     (target.id ? '#' + target.id : ''),
            text: target.textContent?.substring(0, 30),
            timestamp: Date.now()
          });
        }, true);
        
        // Record form inputs
        document.addEventListener('input', (e) => {
          const target = e.target as HTMLInputElement;
          window.__recordedActions.push({
            type: 'input',
            selector: target.tagName.toLowerCase() + 
                     (target.id ? '#' + target.id : '') +
                     (target.name ? `[name="${target.name}"]` : ''),
            value: target.type === 'password' ? '***' : target.value,
            timestamp: Date.now()
          });
        }, true);
      });
    });
  }

  /**
   * Embed Chromium window with full height (no tabbar offset)
   */
  private async embedChromiumFullHeight(windowTitle: string, sidebarWidth: number): Promise<boolean> {
    try {
      const electronHandle = this.electronWindow.getNativeWindowHandle();
      const electronHex = electronHandle.toString('hex');
      
      const script = `
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

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
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }
    
    public static IntPtr FindChromiumWindow(string title) {
        for (int i = 0; i < 10; i++) {
            // Try by window title
            IntPtr hwnd = FindWindow(null, title);
            if (hwnd != IntPtr.Zero) return hwnd;
            
            // Try by class name
            hwnd = FindWindow("Chrome_WidgetWin_1", null);
            if (hwnd != IntPtr.Zero) return hwnd;
            
            Thread.Sleep(500);
        }
        return IntPtr.Zero;
    }
}
"@

try {
    # Find Chromium window
    $chromiumWindow = [Win32Embed]::FindChromiumWindow("${windowTitle}")
    
    if ($chromiumWindow -eq [IntPtr]::Zero) {
        Write-Output "ERROR: Chromium window not found"
        exit 1
    }
    
    Write-Output "Found Chromium window: $chromiumWindow"
    
    # Get Electron window handle
    $electronWindow = [IntPtr]"0x${electronHex}"
    
    # Window style constants
    $GWL_STYLE = -16
    $WS_CHILD = 0x40000000
    $WS_VISIBLE = 0x10000000
    $WS_POPUP = 0x80000000
    
    # Make Chromium a child window but keep its native UI
    $style = [Win32Embed]::GetWindowLong($chromiumWindow, $GWL_STYLE)
    # Remove WS_POPUP and add WS_CHILD
    $newStyle = ($style -band -bnot $WS_POPUP) -bor $WS_CHILD -bor $WS_VISIBLE
    [Win32Embed]::SetWindowLong($chromiumWindow, $GWL_STYLE, $newStyle)
    
    # Set Electron as parent
    $result = [Win32Embed]::SetParent($chromiumWindow, $electronWindow)
    if ($result -eq [IntPtr]::Zero) {
        Write-Output "ERROR: Failed to set parent"
        exit 1
    }
    
    # Get Electron client area
    $rect = New-Object Win32Embed+RECT
    [Win32Embed]::GetClientRect($electronWindow, [ref]$rect) | Out-Null
    
    # Position Chromium with FULL HEIGHT (no tabbar offset)
    $x = ${sidebarWidth}
    $y = 0  # Start at top since Electron tabbar is hidden
    $width = $rect.Right - $rect.Left - ${sidebarWidth}
    $height = $rect.Bottom - $rect.Top  # Full height
    
    # Move and size the window
    [Win32Embed]::MoveWindow($chromiumWindow, $x, $y, $width, $height, $true) | Out-Null
    
    # Force refresh
    $SWP_FRAMECHANGED = 0x0020
    $SWP_NOZORDER = 0x0004
    [Win32Embed]::SetWindowPos($chromiumWindow, [IntPtr]::Zero, $x, $y, $width, $height, 
                              $SWP_FRAMECHANGED -bor $SWP_NOZORDER) | Out-Null
    
    Write-Output "SUCCESS: Embedded Chromium at ($x, $y) with size ($width x $height)"
    Write-Output "HANDLE:$chromiumWindow"
    
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
`;

      const { stdout, stderr } = await execAsync(
        `powershell -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`
      );
      
      console.log('Embedding output:', stdout);
      if (stderr) console.error('Embedding error:', stderr);
      
      // Extract window handle
      const handleMatch = stdout.match(/HANDLE:(\d+)/);
      if (handleMatch) {
        this.chromiumWindowHandle = handleMatch[1];
      }
      
      return stdout.includes('SUCCESS');
      
    } catch (error) {
      console.error('Failed to embed Chromium:', error);
      return false;
    }
  }

  /**
   * Stop recording and restore UI
   */
  public async stopRecording(): Promise<any> {
    if (!this.isRecording || !this.currentSession || !this.playwrightContext) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      this.currentSession.endTime = Date.now();
      const sessionId = this.currentSession.id;
      
      // Collect actions from all tabs
      const allActions: any[] = [];
      for (const [tabId, tabInfo] of this.recordedTabs) {
        try {
          // Get client-side actions
          const clientActions = await tabInfo.page.evaluate(() => {
            return (window as any).__recordedActions || [];
          });
          
          // Merge actions
          tabInfo.actions.push(...clientActions);
          
          // Add tab context to each action
          tabInfo.actions.forEach((action: any) => {
            allActions.push({
              ...action,
              tabId,
              tabUrl: tabInfo.url,
              tabTitle: tabInfo.title
            });
          });
        } catch (e) {
          // Page might be closed
        }
      }
      
      // Sort all actions by timestamp
      allActions.sort((a, b) => a.timestamp - b.timestamp);
      
      // Stop tracing
      const tracePath = path.join(this.recordingsDir, `${sessionId}-trace.zip`);
      await this.playwrightContext.tracing.stop({ path: tracePath });
      
      // Generate test code
      const testCode = this.generateTestCode(allActions, sessionId);
      
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
        tabCount: this.recordedTabs.size,
        actionCount: allActions.length,
        tracePath,
        specPath,
        recordingMode: 'chromium-native-tabs'
      };
      
      const metadataPath = path.join(this.recordingsDir, `${sessionId}-metadata.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      
      // Clean up Chromium
      await this.cleanup();
      
      // IMPORTANT: Restore Electron UI
      console.log('Restoring Electron tabbar...');
      this.electronWindow.webContents.send('show-tabbar-after-recording');
      
      // Restore WebContentsView
      this.electronWindow.webContents.send('show-webview-after-recording');
      
      // Update sidebar
      this.electronWindow.webContents.send('recording-stopped', metadata);
      this.electronWindow.webContents.send('update-sidebar-progress', {
        step: 'recording',
        status: 'completed'
      });
      
      console.log(`Recording stopped. Generated ${specPath}`);
      
      return {
        session: metadata,
        specCode: testCode,
        specPath,
        metadataPath,
        actions: allActions
      };
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      await this.cleanup();
      // Ensure UI is restored even on error
      this.electronWindow.webContents.send('show-tabbar-after-recording');
      this.electronWindow.webContents.send('show-webview-after-recording');
      return null;
    }
  }

  /**
   * Generate Playwright test code
   */
  private generateTestCode(actions: any[], sessionId: string): string {
    const startUrl = this.currentSession.url;
    
    // Group actions by tab
    const tabGroups = new Map<string, any[]>();
    actions.forEach(action => {
      if (!tabGroups.has(action.tabId)) {
        tabGroups.set(action.tabId, []);
      }
      tabGroups.get(action.tabId)!.push(action);
    });
    
    // Generate action code
    let testSteps = '';
    let currentTab = 'page';
    const tabVars = new Map<string, string>();
    tabVars.set(Array.from(this.recordedTabs.keys())[0], 'page');
    
    actions.forEach(action => {
      // Check if we need to switch context
      if (action.tabId && !tabVars.has(action.tabId)) {
        const newVar = `page${tabVars.size}`;
        tabVars.set(action.tabId, newVar);
        testSteps += `\n  // New tab opened\n`;
        testSteps += `  const ${newVar} = await context.waitForEvent('page');\n`;
        currentTab = newVar;
      } else if (action.tabId) {
        currentTab = tabVars.get(action.tabId) || 'page';
      }
      
      // Generate step based on action type
      switch(action.type) {
        case 'navigate':
          testSteps += `  await ${currentTab}.goto('${action.url}');\n`;
          break;
        case 'click':
          testSteps += `  await ${currentTab}.click('${action.selector}'); // ${action.text || ''}\n`;
          break;
        case 'input':
          const value = action.value === '***' ? '{{PASSWORD}}' : action.value;
          testSteps += `  await ${currentTab}.fill('${action.selector}', '${value}');\n`;
          break;
      }
    });
    
    return `import { test, expect } from '@playwright/test';

test('Chromium Native Tabs Recording - ${sessionId}', async ({ context, page }) => {
  // Recording with ${this.recordedTabs.size} tabs
  // Total actions: ${actions.length}
  
  // Navigate to starting URL
  await page.goto('${startUrl}');
  
  // Recorded actions
${testSteps}
  
  // Verify final states
${Array.from(tabVars.entries()).map(([tabId, varName]) => {
  const tabInfo = this.recordedTabs.get(tabId);
  return `  // ${varName}: ${tabInfo?.title || 'Unknown'}`;
}).join('\n')}
});

/*
 * Recording Session: ${sessionId}
 * Duration: ${Math.round((this.currentSession.endTime - this.currentSession.startTime) / 1000)}s
 * Tabs Used: ${this.recordedTabs.size}
 * 
 * Instructions to replay:
 * npx playwright test ${sessionId}-test.spec.ts
 * 
 * View trace:
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
    this.chromiumWindowHandle = null;
    this.recordedTabs.clear();
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
      tabCount: this.recordedTabs.size,
      mode: 'chromium-native-tabs'
    };
  }

  public async dispose(): Promise<void> {
    await this.cleanup();
  }
}