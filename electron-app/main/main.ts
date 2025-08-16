import { app, BrowserWindow, session, protocol } from 'electron';
import * as path from 'path';
import { WebContentsTabManager } from './WebContentsTabManager';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let tabManager: WebContentsTabManager | null = null;

// WebContentsView is used for tab management - enable remote debugging for Playwright CDP
app.commandLine.appendSwitch('remote-debugging-port', '9222');

// Disable automation detection to avoid Google bot detection
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor,TranslateUI');
app.commandLine.appendSwitch('exclude-switches', 'enable-automation');
app.commandLine.appendSwitch('disable-automation');

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Electron WebView2 Browser',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Allows WebContentsView to access necessary features
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.ico')
  });

  // Load the main UI (from source, not dist)
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'tabbar.html'));

  // Initialize WebContentsTabManager for multi-tab support
  tabManager = new WebContentsTabManager({
    window: mainWindow,
    preloadPath: path.join(__dirname, '..', 'preload.js')
  });

  // Register IPC handlers
  registerIpcHandlers();

  // Setup security policies
  setupSecurity();

  // Handle window closing - dispose before window is destroyed
  mainWindow.on('close', () => {
    if (tabManager) {
      try {
        tabManager.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
      tabManager = null;
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle permission requests for WebContentsView instances
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Handle permissions for WebContentsView instances
    const allowedPermissions = ['media', 'geolocation', 'notifications'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Create initial Google tab once the UI is loaded
  mainWindow.webContents.once('did-finish-load', () => {
    if (tabManager) {
      tabManager.createTab('https://www.google.com');
    }
  });
}

function setupSecurity(): void {
  // Prevent new window creation outside of our tab system
  app.on('web-contents-created', (event, contents) => {
    contents.on('new-window' as any, (event: any, navigationUrl: string) => {
      // Prevent default and handle in tab manager
      event.preventDefault();
      if (tabManager) {
        tabManager.createTab(navigationUrl);
      }
    });

    // Prevent navigation to file:// protocol
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      if (parsedUrl.protocol === 'file:') {
        event.preventDefault();
      }
    });
  });

  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:;"
        ]
      }
    });
  });

  // Register protocol for local resources
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.substr(6);
    callback({ path: path.normalize(`${__dirname}/${url}`) });
  });
}

// App event handlers
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle certificate errors for WebContentsView instances
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // In production, you should verify the certificate
  if (process.env.NODE_ENV === 'development') {
    // Ignore certificate errors in development
    event.preventDefault();
    callback(true);
  } else {
    // Use default behavior in production
    callback(false);
  }
});

// Export for use in other modules
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getTabManager(): WebContentsTabManager | null {
  return tabManager;
}