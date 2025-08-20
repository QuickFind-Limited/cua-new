import { BrowserWindow } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TabAction {
  tabId: string;
  tabIndex: number;
  type: string;
  data: any;
  timestamp: number;
  url?: string;
  title?: string;
}

interface MultiTabSession {
  id: string;
  startTime: number;
  endTime?: number;
  tabs: Map<string, {
    id: string;
    index: number;
    page: Page;
    url: string;
    title: string;
    actions: TabAction[];
    createdAt: number;
  }>;
  tabSwitches: Array<{
    from: string;
    to: string;
    timestamp: number;
  }>;
  activeTabId: string;
}

/**
 * Enhanced Windows Recorder with Multi-Tab Workflow Support
 * Records complete user journeys across multiple tabs including tab creation, switching, and closing
 */
export class PlaywrightWindowsMultiTabRecorder {
  private electronWindow: BrowserWindow;
  private playwrightBrowser: Browser | null = null;
  private playwrightContext: BrowserContext | null = null;
  private session: MultiTabSession | null = null;
  private isRecording = false;
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private playwrightWindowHandle: string | null = null;
  private tabIdCounter = 0;

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
   * Start multi-tab recording session
   */
  public async startRecording(sessionId: string, startUrl?: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Recording is already in progress');
      return false;
    }

    try {
      // Initialize multi-tab session
      this.session = {
        id: sessionId,
        startTime: Date.now(),
        tabs: new Map(),
        tabSwitches: [],
        activeTabId: ''
      };

      // Calculate window bounds
      const bounds = this.electronWindow.getContentBounds();
      const sidebarWidth = 320;
      const tabbarHeight = 40;
      const viewWidth = bounds.width - sidebarWidth;
      const viewHeight = bounds.height - tabbarHeight;

      // Launch Chromium with multi-tab support
      const windowTitle = `PlaywrightRecorder_${sessionId}`;
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          `--window-name=${windowTitle}`,
          '--window-position=0,0',
          `--window-size=${viewWidth},${viewHeight}`,
          '--disable-blink-features=AutomationControlled',
          '--user-data-dir=' + path.join(process.cwd(), 'playwright-profile'),
        ]
      });

      // Create context with persistent state
      this.playwrightContext = await this.playwrightBrowser.newContext({
        viewport: { width: viewWidth, height: viewHeight },
        recordVideo: {
          dir: this.recordingsDir,
          size: { width: viewWidth, height: viewHeight }
        },
        // Store cookies and localStorage for multi-step workflows
        storageState: undefined, // Can load previous state if needed
        acceptDownloads: true,
        ignoreHTTPSErrors: true
      });

      // Start tracing for comprehensive recording
      await this.playwrightContext.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      // Set up context-level event handlers for multi-tab tracking
      this.setupContextEventHandlers();

      // Create first tab
      const firstTab = await this.createTab(startUrl || 'https://www.google.com');
      this.session.activeTabId = firstTab.id;

      // Wait for window creation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Embed the window
      await this.embedPlaywrightWindow(windowTitle, sidebarWidth, tabbarHeight);

      // Hide Electron's WebContentsView
      this.electronWindow.webContents.send('hide-webview-for-recording');

      this.isRecording = true;
      console.log(`Multi-tab recording started for session: ${sessionId}`);
      
      // Notify UI
      this.electronWindow.webContents.send('recording-started', { 
        sessionId,
        mode: 'windows-multitab',
        tabCount: 1
      });

      return true;

    } catch (error) {
      console.error('Failed to start multi-tab recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Create a new tab in the recording session
   */
  private async createTab(url: string): Promise<any> {
    if (!this.playwrightContext || !this.session) {
      throw new Error('No active recording session');
    }

    const page = await this.playwrightContext.newPage();
    const tabId = `tab-${++this.tabIdCounter}`;
    
    // Set up page-specific recording
    await this.setupPageRecording(page, tabId);
    
    // Navigate to URL
    if (url) {
      await page.goto(url);
    }

    const tabInfo = {
      id: tabId,
      index: this.session.tabs.size,
      page,
      url,
      title: await page.title(),
      actions: [],
      createdAt: Date.now()
    };

    this.session.tabs.set(tabId, tabInfo);
    
    console.log(`Created tab ${tabId}: ${url}`);
    
    // Record tab creation
    this.recordTabAction(tabId, {
      type: 'tab-created',
      url,
      timestamp: Date.now()
    });

    return tabInfo;
  }

  /**
   * Set up context-level event handlers for multi-tab tracking
   */
  private setupContextEventHandlers(): void {
    if (!this.playwrightContext) return;

    // Track new pages (tabs)
    this.playwrightContext.on('page', async (page) => {
      // Check if this is a popup or new tab
      const opener = page.opener();
      if (opener) {
        // This is a popup/new tab opened from another page
        const tabId = `tab-${++this.tabIdCounter}`;
        const url = page.url();
        
        console.log(`New tab opened: ${tabId} - ${url}`);
        
        const tabInfo = {
          id: tabId,
          index: this.session!.tabs.size,
          page,
          url,
          title: await page.title(),
          actions: [],
          createdAt: Date.now()
        };

        this.session!.tabs.set(tabId, tabInfo);
        await this.setupPageRecording(page, tabId);
        
        // Record new tab event
        this.recordTabAction(tabId, {
          type: 'tab-opened-from-link',
          url,
          timestamp: Date.now()
        });
        
        // Auto-switch to new tab
        this.switchToTab(tabId);
      }
    });

    // Track tab closes
    this.playwrightContext.on('close', () => {
      console.log('Context closed');
    });
  }

  /**
   * Set up recording for a specific page/tab
   */
  private async setupPageRecording(page: Page, tabId: string): Promise<void> {
    // Track navigation
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        this.recordTabAction(tabId, {
          type: 'navigate',
          url: frame.url(),
          timestamp: Date.now()
        });
      }
    });

    // Track page loads
    page.on('load', () => {
      this.recordTabAction(tabId, {
        type: 'page-loaded',
        url: page.url(),
        title: page.title(),
        timestamp: Date.now()
      });
    });

    // Track console for errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.recordTabAction(tabId, {
          type: 'console-error',
          text: msg.text(),
          timestamp: Date.now()
        });
      }
    });

    // Track downloads
    page.on('download', (download) => {
      this.recordTabAction(tabId, {
        type: 'download',
        filename: download.suggestedFilename(),
        url: download.url(),
        timestamp: Date.now()
      });
    });

    // Track dialogs (alerts, confirms, prompts)
    page.on('dialog', async (dialog) => {
      this.recordTabAction(tabId, {
        type: 'dialog',
        dialogType: dialog.type(),
        message: dialog.message(),
        timestamp: Date.now()
      });
      // Auto-accept dialogs during recording
      await dialog.accept();
    });

    // Inject client-side recorder for detailed DOM interactions
    await page.addInitScript(() => {
      (window as any).__tabActions = [];
      (window as any).__tabId = ''; // Will be set per tab
      
      // Enhanced click tracking
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const isNewTabLink = target.tagName === 'A' && 
                            (target as HTMLAnchorElement).target === '_blank';
        
        (window as any).__tabActions.push({
          type: 'click',
          selector: target.tagName.toLowerCase() + 
                   (target.id ? '#' + target.id : '') +
                   (target.className ? '.' + target.className.split(' ').join('.') : ''),
          text: target.textContent?.substring(0, 50),
          isNewTabLink,
          href: (target as HTMLAnchorElement).href,
          timestamp: Date.now()
        });
      }, true);

      // Track keyboard shortcuts (Ctrl+T for new tab, Ctrl+W for close, etc.)
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
          let action = null;
          switch(e.key.toLowerCase()) {
            case 't':
              action = 'new-tab-shortcut';
              break;
            case 'w':
              action = 'close-tab-shortcut';
              break;
            case 'tab':
              action = 'switch-tab-shortcut';
              break;
          }
          
          if (action) {
            (window as any).__tabActions.push({
              type: 'keyboard-shortcut',
              action,
              timestamp: Date.now()
            });
          }
        }
      }, true);

      // Track form submissions
      document.addEventListener('submit', (e) => {
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const data: any = {};
        formData.forEach((value, key) => {
          data[key] = key.includes('password') ? '***' : value;
        });
        
        (window as any).__tabActions.push({
          type: 'form-submit',
          formId: form.id,
          action: form.action,
          method: form.method,
          data,
          timestamp: Date.now()
        });
      }, true);
    });

    // Set tab ID in page context
    page.evaluate((id) => {
      (window as any).__tabId = id;
    }, tabId);
  }

  /**
   * Record an action for a specific tab
   */
  private recordTabAction(tabId: string, action: any): void {
    if (!this.session) return;
    
    const tab = this.session.tabs.get(tabId);
    if (tab) {
      const tabAction: TabAction = {
        tabId,
        tabIndex: tab.index,
        type: action.type,
        data: action,
        timestamp: action.timestamp || Date.now(),
        url: tab.url,
        title: tab.title
      };
      
      tab.actions.push(tabAction);
      console.log(`Recorded action in ${tabId}:`, action.type);
    }
  }

  /**
   * Switch to a different tab
   */
  private async switchToTab(tabId: string): Promise<void> {
    if (!this.session) return;
    
    const tab = this.session.tabs.get(tabId);
    if (tab) {
      // Record tab switch
      if (this.session.activeTabId !== tabId) {
        this.session.tabSwitches.push({
          from: this.session.activeTabId,
          to: tabId,
          timestamp: Date.now()
        });
      }
      
      this.session.activeTabId = tabId;
      await tab.page.bringToFront();
      
      console.log(`Switched to tab ${tabId}`);
    }
  }

  /**
   * Embed Playwright window (same as before)
   */
  private async embedPlaywrightWindow(windowTitle: string, sidebarWidth: number, tabbarHeight: number): Promise<boolean> {
    // [Previous embedding code remains the same]
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
            IntPtr hwnd = FindWindow(null, title);
            if (hwnd != IntPtr.Zero) return hwnd;
            hwnd = FindWindow("Chrome_WidgetWin_1", title);
            if (hwnd != IntPtr.Zero) return hwnd;
            Thread.Sleep(500);
        }
        return IntPtr.Zero;
    }
}
"@

try {
    $playwrightWindow = [Win32Embed]::FindChromiumWindow("${windowTitle}")
    
    if ($playwrightWindow -eq [IntPtr]::Zero) {
        Write-Output "ERROR: Playwright window not found"
        exit 1
    }
    
    $electronWindow = [IntPtr]"0x${electronHex}"
    
    # Remove window decorations
    $GWL_STYLE = -16
    $WS_CHILD = 0x40000000
    $WS_VISIBLE = 0x10000000
    $WS_CAPTION = 0x00C00000
    $WS_THICKFRAME = 0x00040000
    
    $style = [Win32Embed]::GetWindowLong($playwrightWindow, $GWL_STYLE)
    $newStyle = ($style -band -bnot ($WS_CAPTION -bor $WS_THICKFRAME)) -bor $WS_CHILD -bor $WS_VISIBLE
    [Win32Embed]::SetWindowLong($playwrightWindow, $GWL_STYLE, $newStyle)
    
    # Set parent
    [Win32Embed]::SetParent($playwrightWindow, $electronWindow) | Out-Null
    
    # Position window
    $rect = New-Object Win32Embed+RECT
    [Win32Embed]::GetClientRect($electronWindow, [ref]$rect) | Out-Null
    
    $x = ${sidebarWidth}
    $y = ${tabbarHeight}
    $width = $rect.Right - $rect.Left - ${sidebarWidth}
    $height = $rect.Bottom - $rect.Top - ${tabbarHeight}
    
    [Win32Embed]::MoveWindow($playwrightWindow, $x, $y, $width, $height, $true) | Out-Null
    
    Write-Output "SUCCESS: Embedded at ($x, $y) size ($width x $height)"
    Write-Output "HANDLE:$playwrightWindow"
    
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
`;

      const { stdout } = await execAsync(
        `powershell -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`
      );
      
      if (stdout.includes('SUCCESS:')) {
        const handleMatch = stdout.match(/HANDLE:(\d+)/);
        if (handleMatch) {
          this.playwrightWindowHandle = handleMatch[1];
        }
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('Failed to embed window:', error);
      return false;
    }
  }

  /**
   * Stop recording and generate comprehensive multi-tab test
   */
  public async stopRecording(): Promise<any> {
    if (!this.isRecording || !this.session || !this.playwrightContext) {
      return null;
    }

    try {
      this.session.endTime = Date.now();
      const sessionId = this.session.id;
      
      // Collect client-side actions from all tabs
      for (const [tabId, tab] of this.session.tabs) {
        try {
          const clientActions = await tab.page.evaluate(() => {
            return (window as any).__tabActions || [];
          });
          
          // Merge client actions
          clientActions.forEach((action: any) => {
            this.recordTabAction(tabId, action);
          });
        } catch (e) {
          // Page might be closed
        }
      }
      
      // Stop tracing
      const tracePath = path.join(this.recordingsDir, `${sessionId}-trace.zip`);
      await this.playwrightContext.tracing.stop({ path: tracePath });
      
      // Take screenshots of all open tabs
      const screenshots: any = {};
      for (const [tabId, tab] of this.session.tabs) {
        try {
          const screenshotPath = path.join(this.recordingsDir, `${sessionId}-${tabId}.png`);
          await tab.page.screenshot({ path: screenshotPath, fullPage: true });
          screenshots[tabId] = screenshotPath;
        } catch (e) {
          // Page might be closed
        }
      }
      
      // Generate multi-tab test code
      const testCode = this.generateMultiTabTestCode();
      
      // Save test file
      const specPath = path.join(this.recordingsDir, `${sessionId}-multitab.spec.ts`);
      await fs.writeFile(specPath, testCode, 'utf8');
      
      // Create comprehensive metadata
      const metadata = {
        sessionId,
        mode: 'multi-tab',
        startTime: this.session.startTime,
        endTime: this.session.endTime,
        duration: this.session.endTime - this.session.startTime,
        tabCount: this.session.tabs.size,
        totalActions: Array.from(this.session.tabs.values())
          .reduce((sum, tab) => sum + tab.actions.length, 0),
        tabSwitches: this.session.tabSwitches.length,
        tabs: Array.from(this.session.tabs.values()).map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          actionCount: tab.actions.length
        })),
        tracePath,
        screenshots,
        specPath
      };
      
      const metadataPath = path.join(this.recordingsDir, `${sessionId}-metadata.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      
      // Clean up
      await this.cleanup();
      
      // Restore Electron UI
      this.electronWindow.webContents.send('show-webview-after-recording');
      this.electronWindow.webContents.send('recording-stopped', metadata);
      
      console.log(`Multi-tab recording stopped. ${metadata.tabCount} tabs, ${metadata.totalActions} actions`);
      
      return {
        session: metadata,
        testCode,
        specPath,
        metadataPath
      };
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      await this.cleanup();
      return null;
    }
  }

  /**
   * Generate Playwright test code for multi-tab workflow
   */
  private generateMultiTabTestCode(): string {
    if (!this.session) return '';
    
    const sessionId = this.session.id;
    const tabs = Array.from(this.session.tabs.values());
    
    // Build sequential test from all actions across tabs
    let testSteps = '';
    const allActions: any[] = [];
    
    // Collect all actions with tab context
    tabs.forEach(tab => {
      tab.actions.forEach(action => {
        allActions.push({
          ...action,
          tabId: tab.id,
          tabIndex: tab.index
        });
      });
    });
    
    // Sort by timestamp
    allActions.sort((a, b) => a.timestamp - b.timestamp);
    
    // Track current context in generated code
    let currentTabVar = 'page';
    const tabVars = new Map<string, string>();
    tabVars.set(tabs[0].id, 'page');
    
    // Generate steps
    allActions.forEach(action => {
      const tabVar = tabVars.get(action.tabId) || 'page';
      
      switch(action.type) {
        case 'navigate':
          testSteps += `  await ${tabVar}.goto('${action.data.url}');\n`;
          break;
          
        case 'tab-opened-from-link':
          const newTabVar = `page${tabVars.size}`;
          tabVars.set(action.tabId, newTabVar);
          testSteps += `\n  // New tab opened\n`;
          testSteps += `  const ${newTabVar} = await context.waitForEvent('page');\n`;
          testSteps += `  await ${newTabVar}.waitForLoadState();\n`;
          currentTabVar = newTabVar;
          break;
          
        case 'click':
          testSteps += `  await ${tabVar}.click('${action.data.selector}');\n`;
          break;
          
        case 'form-submit':
          testSteps += `\n  // Form submission\n`;
          Object.entries(action.data.data).forEach(([key, value]) => {
            if (value !== '***') {
              testSteps += `  await ${tabVar}.fill('[name="${key}"]', '${value}');\n`;
            }
          });
          testSteps += `  await ${tabVar}.locator('${action.data.formId}').submit();\n`;
          break;
          
        case 'tab-switch':
          currentTabVar = tabVars.get(action.data.to) || 'page';
          testSteps += `\n  // Switch to tab\n`;
          testSteps += `  await ${currentTabVar}.bringToFront();\n`;
          break;
      }
    });
    
    // Add tab switch tracking
    this.session.tabSwitches.forEach(sw => {
      const fromVar = tabVars.get(sw.from) || 'page';
      const toVar = tabVars.get(sw.to) || 'page';
      testSteps += `\n  // User switched from ${fromVar} to ${toVar}\n`;
      testSteps += `  await ${toVar}.bringToFront();\n`;
    });
    
    return `import { test, expect, BrowserContext } from '@playwright/test';

test('Multi-Tab Workflow - ${sessionId}', async ({ context, page }) => {
  // Multi-tab workflow with ${tabs.length} tabs
  // Total actions: ${allActions.length}
  // Tab switches: ${this.session.tabSwitches.length}
  
  // Enable popup handling
  context.on('page', async newPage => {
    console.log('New tab opened:', await newPage.title());
  });
  
  // Start with first tab
  await page.goto('${tabs[0].url}');
  
  // Recorded workflow
${testSteps}
  
  // Verify final states
${Array.from(tabVars.entries()).map(([tabId, varName]) => {
  const tab = this.session!.tabs.get(tabId);
  return `  await expect(${varName}).toHaveURL('${tab?.url}');`;
}).join('\n')}
});

/*
 * Multi-Tab Recording Session
 * Session ID: ${sessionId}
 * Duration: ${Math.round((this.session.endTime! - this.session.startTime) / 1000)}s
 * Tabs: ${tabs.map(t => `${t.id} (${t.url})`).join(', ')}
 * 
 * Tab Timeline:
${tabs.map(tab => ` * ${tab.id}: ${tab.actions.length} actions - ${tab.title}`).join('\n')}
 * 
 * To replay: npx playwright test ${sessionId}-multitab.spec.ts
 */
`;
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    this.isRecording = false;
    
    try {
      if (this.session) {
        for (const tab of this.session.tabs.values()) {
          await tab.page.close();
        }
      }
      if (this.playwrightContext) {
        await this.playwrightContext.close();
      }
      if (this.playwrightBrowser) {
        await this.playwrightBrowser.close();
      }
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
    
    this.session = null;
    this.playwrightBrowser = null;
    this.playwrightContext = null;
    this.playwrightWindowHandle = null;
  }

  public getRecordingStatus(): any {
    return {
      isRecording: this.isRecording,
      sessionId: this.session?.id,
      tabCount: this.session?.tabs.size || 0,
      activeTabId: this.session?.activeTabId,
      totalActions: this.session ? 
        Array.from(this.session.tabs.values()).reduce((sum, tab) => sum + tab.actions.length, 0) : 0
    };
  }

  public async dispose(): Promise<void> {
    await this.cleanup();
  }
}