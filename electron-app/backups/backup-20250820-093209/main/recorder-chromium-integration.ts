import { BrowserWindow, ipcMain } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Chromium Integration for Recording
 * Hides Electron tabbar and uses Chromium's native tabs during recording
 */
export class RecorderChromiumIntegration {
  private electronWindow: BrowserWindow;
  private playwrightBrowser: Browser | null = null;
  private playwrightContext: BrowserContext | null = null;
  private isRecording = false;
  private originalBounds: any = null;

  constructor(electronWindow: BrowserWindow) {
    this.electronWindow = electronWindow;
  }

  /**
   * Start recording with Chromium's native tab management
   */
  public async startRecording(sessionId: string, startUrl?: string): Promise<boolean> {
    if (this.isRecording) {
      return false;
    }

    try {
      // Store original bounds
      this.originalBounds = this.electronWindow.getContentBounds();
      
      // Calculate new bounds (full height without tabbar)
      const sidebarWidth = 320;
      const viewWidth = this.originalBounds.width - sidebarWidth;
      const viewHeight = this.originalBounds.height; // Full height
      
      // Notify UI to hide tabbar
      this.electronWindow.webContents.send('hide-tabbar-for-recording');
      
      // Launch Chromium with normal UI (includes tabs)
      const windowTitle = `PlaywrightRecorder_${sessionId}`;
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          `--window-name=${windowTitle}`,
          '--window-position=0,0',
          `--window-size=${viewWidth},${viewHeight}`,
          '--disable-blink-features=AutomationControlled',
          // Allow normal browser UI with tabs
          '--enable-features=TabGroups',
          '--user-data-dir=' + path.join(process.cwd(), 'playwright-profile'),
        ]
      });

      // Create context
      this.playwrightContext = await this.playwrightBrowser.newContext({
        viewport: null, // Use full window
        recordVideo: {
          dir: path.join(process.cwd(), 'recordings')
        }
      });

      // Start tracing
      await this.playwrightContext.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      // Create first tab
      const firstPage = await this.playwrightContext.newPage();
      if (startUrl) {
        await firstPage.goto(startUrl);
      }

      // Set up multi-tab tracking
      this.setupMultiTabTracking();

      // Wait for window creation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Embed with full height (no tabbar offset)
      await this.embedChromiumWindow(windowTitle, sidebarWidth, 0);

      this.isRecording = true;
      
      // Update UI
      this.electronWindow.webContents.send('recording-started', {
        sessionId,
        mode: 'chromium-native-tabs',
        message: 'Use Chromium tabs (Ctrl+T for new tab)'
      });

      return true;

    } catch (error) {
      console.error('Failed to start Chromium recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Set up tracking for Chromium's native tabs
   */
  private setupMultiTabTracking(): void {
    if (!this.playwrightContext) return;

    const tabInfo = new Map<Page, any>();
    
    // Track new tabs/pages
    this.playwrightContext.on('page', async (page) => {
      const tabId = `tab-${tabInfo.size + 1}`;
      const info = {
        id: tabId,
        page,
        url: page.url(),
        createdAt: Date.now(),
        actions: []
      };
      
      tabInfo.set(page, info);
      
      console.log(`New Chromium tab opened: ${tabId} - ${page.url()}`);
      
      // Notify Electron UI about new tab (optional)
      this.electronWindow.webContents.send('chromium-tab-opened', {
        tabId,
        url: page.url(),
        title: await page.title()
      });
      
      // Set up page tracking
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          info.actions.push({
            type: 'navigate',
            url: frame.url(),
            timestamp: Date.now()
          });
        }
      });
      
      page.on('close', () => {
        console.log(`Chromium tab closed: ${info.id}`);
        this.electronWindow.webContents.send('chromium-tab-closed', {
          tabId: info.id
        });
        tabInfo.delete(page);
      });
    });
  }

  /**
   * Embed Chromium window without tabbar offset
   */
  private async embedChromiumWindow(
    windowTitle: string, 
    sidebarWidth: number, 
    tabbarHeight: number
  ): Promise<boolean> {
    try {
      const electronHandle = this.electronWindow.getNativeWindowHandle();
      const electronHex = electronHandle.toString('hex');
      
      const script = `
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    
    [DllImport("user32.dll")]
    public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
    
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }
}
"@

# Find Chromium window
$chromiumWindow = [IntPtr]::Zero
for ($i = 0; $i -lt 10; $i++) {
    $chromiumWindow = [Win32]::FindWindow($null, "${windowTitle}")
    if ($chromiumWindow -ne [IntPtr]::Zero) { break }
    $chromiumWindow = [Win32]::FindWindow("Chrome_WidgetWin_1", $null)
    if ($chromiumWindow -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 500
}

if ($chromiumWindow -eq [IntPtr]::Zero) {
    Write-Output "ERROR: Chromium window not found"
    exit 1
}

$electronWindow = [IntPtr]"0x${electronHex}"

# Keep Chromium's native UI (tabs, address bar)
# Just embed it as a child window
$GWL_STYLE = -16
$WS_CHILD = 0x40000000
$WS_VISIBLE = 0x10000000

$style = [Win32]::GetWindowLong($chromiumWindow, $GWL_STYLE)
$newStyle = $style -bor $WS_CHILD -bor $WS_VISIBLE
[Win32]::SetWindowLong($chromiumWindow, $GWL_STYLE, $newStyle)

# Set as child of Electron
[Win32]::SetParent($chromiumWindow, $electronWindow) | Out-Null

# Get Electron client area
$rect = New-Object Win32+RECT
[Win32]::GetClientRect($electronWindow, [ref]$rect) | Out-Null

# Position with full height (no tabbar offset needed)
$x = ${sidebarWidth}
$y = ${tabbarHeight}
$width = $rect.Right - $rect.Left - ${sidebarWidth}
$height = $rect.Bottom - $rect.Top - ${tabbarHeight}

[Win32]::MoveWindow($chromiumWindow, $x, $y, $width, $height, $true) | Out-Null

Write-Output "SUCCESS: Embedded Chromium with native tabs"
`;

      const { stdout } = await execAsync(
        `powershell -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`
      );
      
      return stdout.includes('SUCCESS');
      
    } catch (error) {
      console.error('Failed to embed Chromium:', error);
      return false;
    }
  }

  /**
   * Alternative: Use App Mode (no tabs visible)
   */
  public async startRecordingAppMode(sessionId: string, startUrl?: string): Promise<boolean> {
    try {
      const bounds = this.electronWindow.getContentBounds();
      const sidebarWidth = 320;
      const tabbarHeight = 40; // Keep your tabbar
      const viewWidth = bounds.width - sidebarWidth;
      const viewHeight = bounds.height - tabbarHeight;
      
      // Launch in app mode - no browser UI
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          `--app=${startUrl || 'https://www.google.com'}`,
          '--window-position=0,0',
          `--window-size=${viewWidth},${viewHeight}`,
          '--disable-blink-features=AutomationControlled',
          '--hide-scrollbars',
          '--disable-infobars',
          '--disable-session-crashed-bubble',
          '--disable-features=TranslateUI',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      });

      // Create context
      this.playwrightContext = await this.playwrightBrowser.newContext({
        viewport: { width: viewWidth, height: viewHeight }
      });

      // Pages are managed programmatically
      const pages: Page[] = [];
      
      this.playwrightContext.on('page', async (page) => {
        pages.push(page);
        
        // Update Electron tabbar to show recording tabs
        this.electronWindow.webContents.send('add-recording-tab', {
          index: pages.length,
          url: page.url(),
          title: await page.title()
        });
      });

      const firstPage = await this.playwrightContext.newPage();
      if (startUrl) {
        await firstPage.goto(startUrl);
      }

      // Embed without Chrome UI
      await this.embedChromiumWindow(`Chromium`, sidebarWidth, tabbarHeight);

      this.isRecording = true;
      return true;

    } catch (error) {
      console.error('Failed to start app mode recording:', error);
      return false;
    }
  }

  /**
   * Stop recording
   */
  public async stopRecording(): Promise<any> {
    if (!this.isRecording) {
      return null;
    }

    try {
      // Stop tracing
      if (this.playwrightContext) {
        const tracePath = path.join(process.cwd(), 'recordings', `trace-${Date.now()}.zip`);
        await this.playwrightContext.tracing.stop({ path: tracePath });
      }
      
      // Clean up
      await this.cleanup();
      
      // Restore Electron UI
      this.electronWindow.webContents.send('show-tabbar-after-recording');
      this.electronWindow.webContents.send('restore-webcontentsview');
      
      this.isRecording = false;
      
      return { success: true };
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return null;
    }
  }

  private async cleanup(): Promise<void> {
    if (this.playwrightContext) {
      await this.playwrightContext.close();
    }
    if (this.playwrightBrowser) {
      await this.playwrightBrowser.close();
    }
    this.playwrightContext = null;
    this.playwrightBrowser = null;
  }
}