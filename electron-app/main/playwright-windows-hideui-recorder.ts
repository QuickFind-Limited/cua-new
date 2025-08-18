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
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          '--window-position=0,0',
          `--window-size=${viewWidth},${viewHeight}`,
          '--disable-blink-features=AutomationControlled',
          // Keep Chromium's native UI  
          '--enable-features=TabGroups'
        ]
      });

      // Get the browser process PID for window finding
      // For Chromium, we need to get the browser process differently
      let chromiumPid: number | null = null;
      try {
        // Try to get the browser process - this might vary by Playwright version
        const browserProcess = (this.playwrightBrowser as any)._process || 
                              (this.playwrightBrowser as any).process || 
                              null;
        if (browserProcess && browserProcess.pid) {
          chromiumPid = browserProcess.pid;
        } else if (browserProcess && typeof browserProcess === 'function') {
          const proc = browserProcess();
          chromiumPid = proc ? proc.pid : null;
        }
      } catch (e) {
        console.warn('Could not get browser process PID:', e);
      }
      console.log('Chromium launched with PID:', chromiumPid);

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
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Embed Chromium window at position (320, 0) - no tabbar offset
      // Pass the PID for identification
      const embedded = await this.embedChromiumFullHeight(sessionId, sidebarWidth, chromiumPid);
      
      if (!embedded) {
        console.error('Failed to embed Chromium window - continuing anyway');
        // Don't throw error, let recording continue even if embedding fails
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
      await page.addInitScript(() => {
        (window as any).__recordedActions = [];
        
        // Record clicks
        document.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          (window as any).__recordedActions.push({
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
          (window as any).__recordedActions.push({
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
  private async embedChromiumFullHeight(sessionId: string, sidebarWidth: number, chromiumPid: number | null): Promise<boolean> {
    try {
      const electronHandle = this.electronWindow.getNativeWindowHandle();
      // CRITICAL: Convert buffer to number properly, not hex string
      const parentHandle = electronHandle.readInt32LE(0);
      
      // Wait a bit for Chrome window to be fully created
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // First, let's try a simpler approach - find the most recently created Chrome window
      const script = `
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Linq;

public class Win32Embed {
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
    
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    
    [DllImport("user32.dll")]
    public static extern bool RedrawWindow(IntPtr hWnd, IntPtr lpRect, IntPtr hrgnUpdate, uint flags);
    
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    public static extern IntPtr SetFocus(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }
    
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
    
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);
    
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    
    public static List<IntPtr> FindAllChromeWindows() {
        var windows = new List<IntPtr>();
        
        EnumWindows(delegate(IntPtr wnd, IntPtr param) {
            // Check if window is visible
            if (!IsWindowVisible(wnd)) {
                return true;
            }
            
            var className = new System.Text.StringBuilder(256);
            GetClassName(wnd, className, 256);
            
            // Look for Chrome/Chromium window class (both use same class name)
            if (className.ToString() == "Chrome_WidgetWin_1" -or className.ToString().StartsWith("Chrome_WidgetWin")) {
                var windowText = new System.Text.StringBuilder(256);
                GetWindowText(wnd, windowText, 256);
                
                // Skip DevTools and other special windows
                string title = windowText.ToString();
                if (!title.Contains("DevTools") && 
                    !title.Contains("Extensions") &&
                    !title.Contains("Task Manager")) {
                    
                    // Get process ID to verify it's a main window
                    uint processId;
                    GetWindowThreadProcessId(wnd, out processId);
                    
                    Console.WriteLine("Found Chrome window: Handle=" + wnd + ", Title='" + title + "', PID=" + processId);
                    windows.Add(wnd);
                }
            }
            return true; // Continue enumeration
        }, IntPtr.Zero);
        
        return windows;
    }
}
"@

try {
    Write-Output "Searching for Chrome window with PID: ${chromiumPid || 0}"
    
    $targetPid = ${chromiumPid || 0}
    $chromiumWindow = [IntPtr]::Zero
    
    # Method 1: Direct process search by PID
    if ($targetPid -gt 0) {
        try {
            $proc = Get-Process -Id $targetPid -ErrorAction Stop
            if ($proc.MainWindowHandle -ne 0) {
                Write-Output "Found Chromium by PID with handle: $($proc.MainWindowHandle)"
                $chromiumWindow = $proc.MainWindowHandle
            }
        } catch {
            Write-Output "Could not find process with PID $targetPid"
        }
    }
    
    # Method 2: If not found by PID, find window for our specific process using Win32
    if ($chromiumWindow -eq [IntPtr]::Zero -and $targetPid -gt 0) {
        $chromeWindows = [Win32Embed]::FindAllChromeWindows()
        foreach ($hwnd in $chromeWindows) {
            $processId = 0
            [Win32Embed]::GetWindowThreadProcessId($hwnd, [ref]$processId)
            if ($processId -eq $targetPid) {
                Write-Output "Found Chromium window by Win32 for PID $targetPid: $hwnd"
                $chromiumWindow = $hwnd
                break
            }
        }
    }
    
    # Method 3: Fallback - use most recent Chrome window
    if ($chromiumWindow -eq [IntPtr]::Zero) {
        $chromeWindows = [Win32Embed]::FindAllChromeWindows()
        if ($chromeWindows.Count -gt 0) {
            Write-Output "Using fallback - most recent Chrome window"
            $chromiumWindow = $chromeWindows[$chromeWindows.Count - 1]
        }
    }
    
    if ($chromiumWindow -eq [IntPtr]::Zero) {
        Write-Output "ERROR: No Chrome window found"
        Write-Output "Target PID was: $targetPid"
        exit 1
    }
    
    Write-Output "Using Chrome window: $chromiumWindow"
    
    # Get Electron window handle (already converted to number in TypeScript)
    $electronWindow = [IntPtr]${parentHandle}
    Write-Output "Electron window: $electronWindow"
    
    # Window style constants
    $GWL_STYLE = -16
    $WS_CHILD = 0x40000000
    $WS_VISIBLE = 0x10000000
    
    # Get current style
    $style = [Win32Embed]::GetWindowLong($chromiumWindow, $GWL_STYLE)
    Write-Output "Original style: 0x$($style.ToString('X8'))"
    
    # Remove window caption and borders (0x00C00000 = WS_CAPTION)
    # Add WS_CHILD and WS_VISIBLE
    $newStyle = ($style -band -bnot 0x00C00000) -bor $WS_CHILD -bor $WS_VISIBLE
    Write-Output "New style: 0x$($newStyle.ToString('X8'))"
    
    [Win32Embed]::SetWindowLong($chromiumWindow, $GWL_STYLE, $newStyle)
    
    # Set Electron as parent
    Write-Output "Setting parent window..."
    $result = [Win32Embed]::SetParent($chromiumWindow, $electronWindow)
    if ($result -eq [IntPtr]::Zero) {
        Write-Output "ERROR: SetParent failed"
        exit 1
    }
    Write-Output "SetParent succeeded: $result"
    
    # Get Electron client area
    $rect = New-Object Win32Embed+RECT
    [Win32Embed]::GetClientRect($electronWindow, [ref]$rect) | Out-Null
    Write-Output "Electron client area: $($rect.Right - $rect.Left) x $($rect.Bottom - $rect.Top)"
    
    # Position Chromium
    $x = ${sidebarWidth}
    $y = 0
    $width = $rect.Right - $rect.Left - ${sidebarWidth}
    $height = $rect.Bottom - $rect.Top
    
    Write-Output "Positioning Chrome at: ($x, $y) size: $width x $height"
    
    # Move and size the window
    $moveResult = [Win32Embed]::MoveWindow($chromiumWindow, $x, $y, $width, $height, $true)
    Write-Output "MoveWindow result: $moveResult"
    
    # Ensure window is visible (SW_SHOW = 5)
    [Win32Embed]::ShowWindow($chromiumWindow, 5)
    
    # Force refresh with multiple flags
    $SWP_FRAMECHANGED = 0x0020
    $SWP_NOZORDER = 0x0004
    $RDW_INVALIDATE = 0x0001
    $RDW_ALLCHILDREN = 0x0080
    $RDW_UPDATENOW = 0x0100
    $RDW_FRAME = 0x0400
    
    # Force proper redraw
    [Win32Embed]::RedrawWindow($electronWindow, [IntPtr]::Zero, [IntPtr]::Zero, $RDW_INVALIDATE -bor $RDW_ALLCHILDREN -bor $RDW_UPDATENOW -bor $RDW_FRAME)
    [Win32Embed]::RedrawWindow($chromiumWindow, [IntPtr]::Zero, [IntPtr]::Zero, $RDW_INVALIDATE -bor $RDW_UPDATENOW)
    
    # Restore focus to Chromium window
    [Win32Embed]::SetForegroundWindow($chromiumWindow)
    [Win32Embed]::SetFocus($chromiumWindow)
    
    Write-Output "SUCCESS: Embedded Chromium at ($x, $y) with size ($width x $height)"
    Write-Output "HANDLE:$chromiumWindow"
    
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    Write-Output "Stack trace: $($_.Exception.StackTrace)"
    exit 1
}
`;

      console.log('Executing PowerShell embedding script...');
      const { stdout, stderr } = await execAsync(
        `powershell -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`
      );
      
      console.log('Embedding stdout:', stdout || '(empty)');
      if (stderr) console.error('Embedding stderr:', stderr);
      
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