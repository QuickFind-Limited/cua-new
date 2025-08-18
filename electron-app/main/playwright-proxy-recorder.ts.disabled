import { BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

/**
 * Proxy Recorder that mirrors Playwright browser content to Electron
 * Launches Playwright off-screen and streams its content to Electron WebContentsView
 */
export class PlaywrightProxyRecorder {
  private electronWindow: BrowserWindow;
  private playwrightBrowser: Browser | null = null;
  private playwrightPage: Page | null = null;
  private socketServer: SocketServer | null = null;
  private httpServer: any = null;
  private isRecording = false;
  private streamInterval: NodeJS.Timer | null = null;

  constructor(electronWindow: BrowserWindow) {
    this.electronWindow = electronWindow;
    this.setupStreamingServer();
  }

  /**
   * Set up WebSocket server for streaming
   */
  private setupStreamingServer(): void {
    this.httpServer = createServer();
    this.socketServer = new SocketServer(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.socketServer.on('connection', (socket) => {
      console.log('Streaming client connected');
      
      socket.on('mouse-event', async (data) => {
        await this.forwardMouseEvent(data);
      });
      
      socket.on('keyboard-event', async (data) => {
        await this.forwardKeyboardEvent(data);
      });
      
      socket.on('disconnect', () => {
        console.log('Streaming client disconnected');
      });
    });

    this.httpServer.listen(8765, () => {
      console.log('Streaming server listening on port 8765');
    });
  }

  /**
   * Start recording with hidden Playwright browser
   */
  public async startRecording(sessionId: string, startUrl?: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Recording is already in progress');
      return false;
    }

    try {
      // Get Electron window bounds for matching viewport
      const bounds = this.electronWindow.getContentBounds();
      const viewportWidth = bounds.width - 320; // Minus sidebar
      const viewportHeight = bounds.height - 40; // Minus tabbar

      // Launch Playwright browser off-screen
      this.playwrightBrowser = await chromium.launch({
        headless: false, // Need real browser for full functionality
        args: [
          '--window-position=10000,10000', // Position off-screen
          '--window-size=' + viewportWidth + ',' + viewportHeight,
          '--disable-blink-features=AutomationControlled',
          '--start-maximized'
        ]
      });

      const context = await this.playwrightBrowser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight },
        recordVideo: {
          dir: path.join(process.cwd(), 'recordings'),
          size: { width: viewportWidth, height: viewportHeight }
        }
      });

      // Start tracing for codegen
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });

      this.playwrightPage = await context.newPage();
      
      // Set up page event listeners for recording
      this.setupPageEventListeners();
      
      if (startUrl) {
        await this.playwrightPage.goto(startUrl);
      }

      // Start streaming screenshots to Electron
      await this.startScreenStreaming();

      // Inject streaming client into Electron WebContentsView
      await this.injectStreamingClient();

      this.isRecording = true;
      console.log(`Proxy recording started for session: ${sessionId}`);
      return true;

    } catch (error) {
      console.error('Failed to start proxy recording:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Set up event listeners on Playwright page
   */
  private setupPageEventListeners(): void {
    if (!this.playwrightPage) return;

    const recordedActions: any[] = [];

    // Record all navigation events
    this.playwrightPage.on('framenavigated', (frame) => {
      if (frame === this.playwrightPage!.mainFrame()) {
        recordedActions.push({
          type: 'navigate',
          url: frame.url(),
          timestamp: Date.now()
        });
      }
    });

    // Record console messages
    this.playwrightPage.on('console', (msg) => {
      recordedActions.push({
        type: 'console',
        level: msg.type(),
        text: msg.text(),
        timestamp: Date.now()
      });
    });

    // Store for later retrieval
    (this.playwrightPage as any).__recordedActions = recordedActions;
  }

  /**
   * Start streaming screenshots from Playwright to Electron
   */
  private async startScreenStreaming(): Promise<void> {
    if (!this.playwrightPage || !this.socketServer) return;

    // Stream screenshots at 30 FPS
    this.streamInterval = setInterval(async () => {
      try {
        if (!this.playwrightPage || !this.isRecording) return;

        // Take screenshot
        const screenshot = await this.playwrightPage.screenshot({
          type: 'jpeg',
          quality: 80,
          fullPage: false
        });

        // Send to all connected clients
        this.socketServer!.emit('frame', {
          data: screenshot.toString('base64'),
          timestamp: Date.now()
        });

      } catch (error) {
        console.warn('Screenshot streaming error:', error);
      }
    }, 33); // ~30 FPS
  }

  /**
   * Inject streaming client into Electron WebContentsView
   */
  private async injectStreamingClient(): Promise<void> {
    const clientScript = `
(function() {
  const socket = io('http://localhost:8765');
  
  // Create canvas for displaying stream
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '999999';
  canvas.style.pointerEvents = 'auto';
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  
  // Handle incoming frames
  socket.on('frame', (data) => {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = 'data:image/jpeg;base64,' + data.data;
  });
  
  // Forward mouse events
  canvas.addEventListener('click', (e) => {
    socket.emit('mouse-event', {
      type: 'click',
      x: e.offsetX,
      y: e.offsetY,
      button: e.button
    });
  });
  
  canvas.addEventListener('mousemove', (e) => {
    socket.emit('mouse-event', {
      type: 'move',
      x: e.offsetX,
      y: e.offsetY
    });
  });
  
  // Forward keyboard events
  document.addEventListener('keydown', (e) => {
    socket.emit('keyboard-event', {
      type: 'keydown',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey
    });
  });
  
  document.addEventListener('keyup', (e) => {
    socket.emit('keyboard-event', {
      type: 'keyup',
      key: e.key,
      code: e.code
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    canvas.remove();
  });
  
  window.__proxyRecorder = {
    socket,
    canvas,
    stop: () => {
      socket.disconnect();
      canvas.remove();
    }
  };
})();
`;

    // Inject into Electron's WebContentsView
    this.electronWindow.webContents.executeJavaScript(clientScript);
  }

  /**
   * Forward mouse events to Playwright browser
   */
  private async forwardMouseEvent(event: any): Promise<void> {
    if (!this.playwrightPage) return;

    try {
      switch (event.type) {
        case 'click':
          await this.playwrightPage.mouse.click(event.x, event.y, {
            button: event.button === 0 ? 'left' : event.button === 1 ? 'middle' : 'right'
          });
          break;
        case 'move':
          await this.playwrightPage.mouse.move(event.x, event.y);
          break;
        case 'down':
          await this.playwrightPage.mouse.down();
          break;
        case 'up':
          await this.playwrightPage.mouse.up();
          break;
      }
    } catch (error) {
      console.warn('Failed to forward mouse event:', error);
    }
  }

  /**
   * Forward keyboard events to Playwright browser
   */
  private async forwardKeyboardEvent(event: any): Promise<void> {
    if (!this.playwrightPage) return;

    try {
      if (event.type === 'keydown') {
        if (event.key.length === 1) {
          await this.playwrightPage.keyboard.type(event.key);
        } else {
          await this.playwrightPage.keyboard.press(event.key);
        }
      }
    } catch (error) {
      console.warn('Failed to forward keyboard event:', error);
    }
  }

  /**
   * Alternative: Use desktop capturer for better performance
   */
  private async setupDesktopCapture(): Promise<void> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1920, height: 1080 }
      });

      const playwrightWindow = sources.find(source => 
        source.name.includes('Chromium') || source.name.includes('PlaywrightRecorder')
      );

      if (playwrightWindow) {
        // Stream the window using WebRTC
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: playwrightWindow.id
            }
          }
        });

        // Send stream to Electron WebContentsView
        this.electronWindow.webContents.send('playwright-stream', {
          streamId: playwrightWindow.id
        });
      }
    } catch (error) {
      console.error('Desktop capture setup failed:', error);
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
      // Stop screenshot streaming
      if (this.streamInterval) {
        clearInterval(this.streamInterval);
        this.streamInterval = null;
      }

      // Clean up streaming client
      await this.electronWindow.webContents.executeJavaScript(`
        if (window.__proxyRecorder) {
          window.__proxyRecorder.stop();
        }
      `);

      // Get recorded actions
      const recordedActions = this.playwrightPage ? 
        (this.playwrightPage as any).__recordedActions || [] : [];

      // Generate result
      const sessionId = `proxy-${Date.now()}`;
      const result = {
        sessionId,
        actions: recordedActions,
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
    
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }
    
    if (this.playwrightPage) {
      await this.playwrightPage.close();
    }
    if (this.playwrightBrowser) {
      await this.playwrightBrowser.close();
    }
    
    this.playwrightPage = null;
    this.playwrightBrowser = null;
  }

  /**
   * Dispose of all resources
   */
  public async dispose(): Promise<void> {
    await this.cleanup();
    
    if (this.socketServer) {
      this.socketServer.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
  }
}