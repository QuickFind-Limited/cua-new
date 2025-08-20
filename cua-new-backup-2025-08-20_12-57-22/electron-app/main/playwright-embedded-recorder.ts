import { BrowserWindow } from 'electron';
import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Embedded Playwright Recorder using native window embedding
 * Uses platform-specific APIs to embed Playwright window into Electron
 */
export class PlaywrightEmbeddedRecorder {
  private electronWindow: BrowserWindow;
  private playwrightBrowser: Browser | null = null;
  private playwrightPage: Page | null = null;
  private playwrightWindowHandle: string | null = null;
  private isRecording = false;

  constructor(electronWindow: BrowserWindow) {
    this.electronWindow = electronWindow;
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
      // Launch Playwright browser
      this.playwrightBrowser = await chromium.launch({
        headless: false,
        args: [
          '--window-name=PlaywrightRecorder', // Custom window name for identification
          '--user-data-dir=' + path.join(process.cwd(), 'playwright-profile'),
        ]
      });

      const context = await this.playwrightBrowser.newContext({
        recordVideo: {
          dir: path.join(process.cwd(), 'recordings')
        }
      });

      this.playwrightPage = await context.newPage();
      
      if (startUrl) {
        await this.playwrightPage.goto(startUrl);
      }

      // Wait for window to be created
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Embed the Playwright window into Electron
      await this.embedPlaywrightWindow();

      // Start codegen recording
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      this.isRecording = true;
      console.log(`Embedded recording started for session: ${sessionId}`);
      return true;

    } catch (error) {
      console.error('Failed to start embedded recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Embed Playwright window into Electron window (Windows-specific example)
   */
  private async embedPlaywrightWindow(): Promise<void> {
    if (process.platform === 'win32') {
      await this.embedWindowsWindow();
    } else if (process.platform === 'darwin') {
      await this.embedMacWindow();
    } else if (process.platform === 'linux') {
      await this.embedLinuxWindow();
    }
  }

  /**
   * Windows-specific window embedding using Win32 API
   */
  private async embedWindowsWindow(): Promise<void> {
    try {
      // Get Electron window handle
      const electronHandle = this.electronWindow.getNativeWindowHandle().toString('hex');
      
      // PowerShell script to find and embed window
      const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

public class Win32 {
    [DllImport("user32.dll")]
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
}
"@

# Find Playwright window
$playwrightWindow = [Win32]::FindWindow($null, "PlaywrightRecorder")

if ($playwrightWindow -ne [IntPtr]::Zero) {
    # Get Electron window handle
    $electronWindow = [IntPtr]0x${electronHandle}
    
    # Remove window border and caption
    $GWL_STYLE = -16
    $WS_CHILD = 0x40000000
    $WS_VISIBLE = 0x10000000
    
    $style = [Win32]::GetWindowLong($playwrightWindow, $GWL_STYLE)
    $newStyle = ($style -band -bnot 0x00C00000) -bor $WS_CHILD -bor $WS_VISIBLE
    [Win32]::SetWindowLong($playwrightWindow, $GWL_STYLE, $newStyle)
    
    # Set Electron as parent
    [Win32]::SetParent($playwrightWindow, $electronWindow)
    
    # Position within Electron window (accounting for sidebar)
    $SWP_FRAMECHANGED = 0x0020
    [Win32]::SetWindowPos($playwrightWindow, [IntPtr]::Zero, 320, 40, 960, 600, $SWP_FRAMECHANGED)
    
    Write-Output "Successfully embedded Playwright window"
} else {
    Write-Output "Playwright window not found"
}
`;

      const { stdout, stderr } = await execAsync(`powershell -Command "${script}"`);
      console.log('Embedding result:', stdout);
      if (stderr) console.error('Embedding error:', stderr);
      
    } catch (error) {
      console.error('Failed to embed Windows window:', error);
    }
  }

  /**
   * macOS-specific window embedding using Cocoa APIs
   */
  private async embedMacWindow(): Promise<void> {
    try {
      // AppleScript to manipulate windows
      const script = `
tell application "System Events"
    set playwrightWindow to first window of (first process whose name contains "Chromium")
    if exists playwrightWindow then
        -- Get window properties
        set windowBounds to {320, 40, 1280, 640}
        set position of playwrightWindow to {item 1 of windowBounds, item 2 of windowBounds}
        set size of playwrightWindow to {(item 3 of windowBounds) - (item 1 of windowBounds), (item 4 of windowBounds) - (item 2 of windowBounds)}
        
        -- Remove window decorations (requires accessibility permissions)
        set frontmost of playwrightWindow to false
        
        return "Successfully positioned Playwright window"
    else
        return "Playwright window not found"
    end if
end tell
`;

      const { stdout } = await execAsync(`osascript -e '${script}'`);
      console.log('macOS embedding result:', stdout);
      
    } catch (error) {
      console.error('Failed to embed macOS window:', error);
    }
  }

  /**
   * Linux-specific window embedding using X11
   */
  private async embedLinuxWindow(): Promise<void> {
    try {
      // Use xdotool or wmctrl for window manipulation
      const commands = [
        // Find Playwright window
        'xdotool search --name "PlaywrightRecorder"',
        // Remove decorations
        'xprop -id $WINDOW_ID -f _MOTIF_WM_HINTS 32c -set _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0"',
        // Reparent to Electron window
        'xdotool windowreparent $PLAYWRIGHT_ID $ELECTRON_ID',
        // Move and resize
        'xdotool windowmove $PLAYWRIGHT_ID 320 40',
        'xdotool windowsize $PLAYWRIGHT_ID 960 600'
      ];

      console.log('Linux window embedding would execute:', commands);
      
    } catch (error) {
      console.error('Failed to embed Linux window:', error);
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
      // Recording logic similar to integrated recorder
      const result = {
        sessionId: `embedded-${Date.now()}`,
        success: true
      };

      await this.cleanup();
      return result;

    } catch (error) {
      console.error('Failed to stop recording:', error);
      await this.cleanup();
      return null;
    }
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    this.isRecording = false;
    
    if (this.playwrightPage) {
      await this.playwrightPage.close();
    }
    if (this.playwrightBrowser) {
      await this.playwrightBrowser.close();
    }
    
    this.playwrightPage = null;
    this.playwrightBrowser = null;
  }
}