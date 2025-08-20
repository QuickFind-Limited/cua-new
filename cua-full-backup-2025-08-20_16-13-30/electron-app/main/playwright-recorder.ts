import { WebContentsView } from 'electron';

// Define the structure for recorded actions
export interface RecordedAction {
  type: 'click' | 'type' | 'navigate' | 'submit' | 'scroll' | 'wait' | 'select' | 'hover' | 'keypress';
  selector?: string;
  value?: string;
  url?: string;
  timestamp: number;
  coordinates?: { x: number; y: number };
  element?: {
    tagName: string;
    attributes: Record<string, string>;
    text?: string;
  };
  waitTime?: number;
  scrollPosition?: { x: number; y: number };
  key?: string;
  modifiers?: string[];
}

export interface RecordingSession {
  id: string;
  startTime: number;
  endTime?: number;
  actions: RecordedAction[];
  url: string;
  title: string;
}

/**
 * Playwright-inspired recorder for capturing user actions in WebContentsView
 */
export class PlaywrightRecorder {
  private isRecording = false;
  private currentSession: RecordingSession | null = null;
  private lastActionTime = 0;
  private injectedScript = false;

  constructor() {}

  /**
   * Start recording user actions in the specified WebContentsView
   */
  public async startRecording(view: WebContentsView, sessionId: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Recording is already in progress');
      return false;
    }

    try {
      // Initialize recording session
      const webContents = view.webContents;
      const url = webContents.getURL();
      const title = webContents.getTitle();

      this.currentSession = {
        id: sessionId,
        startTime: Date.now(),
        actions: [],
        url,
        title
      };

      this.isRecording = true;
      this.lastActionTime = Date.now();

      // Inject recording script into the page
      await this.injectRecordingScript(view);

      // Set up listeners for webContents events
      this.setupWebContentsListeners(view);

      console.log(`Recording started for session: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.isRecording = false;
      this.currentSession = null;
      return false;
    }
  }

  /**
   * Stop recording and return the session data
   */
  public stopRecording(): RecordingSession | null {
    if (!this.isRecording || !this.currentSession) {
      console.warn('No recording in progress');
      return null;
    }

    this.currentSession.endTime = Date.now();
    this.isRecording = false;

    const session = this.currentSession;
    this.currentSession = null;
    this.injectedScript = false;

    console.log(`Recording stopped. Captured ${session.actions.length} actions`);
    return session;
  }

  /**
   * Get current recording status
   */
  public getRecordingStatus(): { isRecording: boolean; sessionId?: string; actionCount?: number } {
    return {
      isRecording: this.isRecording,
      sessionId: this.currentSession?.id,
      actionCount: this.currentSession?.actions.length
    };
  }

  /**
   * Inject JavaScript code into the page to capture user interactions
   */
  private async injectRecordingScript(view: WebContentsView): Promise<void> {
    if (this.injectedScript) return;

    const recordingScript = `
      (function() {
        if (window.playwrightRecorderInjected) return;
        window.playwrightRecorderInjected = true;
        window.recordedActions = [];

        console.log('Playwright recorder script injected');

        // Helper function to get a unique selector for an element
        function getSelector(element) {
          if (element.id) {
            return '#' + element.id;
          }
          
          if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\\s+/).filter(c => c.length > 0);
            if (classes.length > 0) {
              return element.tagName.toLowerCase() + '.' + classes.join('.');
            }
          }
          
          // Try to use specific attributes
          const attrs = ['name', 'data-testid', 'data-test', 'aria-label', 'placeholder'];
          for (const attr of attrs) {
            const value = element.getAttribute(attr);
            if (value) {
              return \`\${element.tagName.toLowerCase()}[\${attr}="\${value}"]\`;
            }
          }
          
          // Fallback to text content for buttons and links
          if (['BUTTON', 'A'].includes(element.tagName) && element.textContent) {
            const text = element.textContent.trim().substring(0, 30);
            return \`\${element.tagName.toLowerCase()}:has-text("\${text}")\`;
          }
          
          // Generate nth-child selector as last resort
          let selector = element.tagName.toLowerCase();
          let parent = element.parentElement;
          let current = element;
          
          while (parent && parent !== document.body) {
            const siblings = Array.from(parent.children).filter(el => el.tagName === current.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              selector = \`\${parent.tagName.toLowerCase()} > \${selector}:nth-child(\${index})\`;
            } else {
              selector = \`\${parent.tagName.toLowerCase()} > \${selector}\`;
            }
            current = parent;
            parent = parent.parentElement;
          }
          
          return selector;
        }

        // Helper function to get element attributes
        function getElementInfo(element) {
          const attrs = {};
          for (const attr of element.attributes) {
            attrs[attr.name] = attr.value;
          }
          return {
            tagName: element.tagName,
            attributes: attrs,
            text: element.textContent ? element.textContent.trim().substring(0, 100) : undefined
          };
        }

        // Helper function to send action to main process
        function recordAction(action) {
          try {
            // Store action in buffer for polling
            if (!window.recordedActions) {
              window.recordedActions = [];
            }
            window.recordedActions.push(action);
            
            // Also try direct communication if available
            if (window.electronAPI && window.electronAPI.recordAction) {
              window.electronAPI.recordAction(action);
            }
          } catch (error) {
            console.error('Failed to record action:', error);
          }
        }

        // Track click events
        document.addEventListener('click', (event) => {
          if (!event.target) return;
          
          const action = {
            type: 'click',
            selector: getSelector(event.target),
            coordinates: { x: event.clientX, y: event.clientY },
            element: getElementInfo(event.target),
            timestamp: Date.now()
          };
          
          recordAction(action);
        }, true);

        // Track input events (typing)
        document.addEventListener('input', (event) => {
          if (!event.target || !['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
          
          const action = {
            type: 'type',
            selector: getSelector(event.target),
            value: event.target.value,
            element: getElementInfo(event.target),
            timestamp: Date.now()
          };
          
          recordAction(action);
        }, true);

        // Track form submissions
        document.addEventListener('submit', (event) => {
          if (!event.target) return;
          
          const formData = new FormData(event.target);
          const formValues = {};
          for (const [key, value] of formData.entries()) {
            formValues[key] = value;
          }
          
          const action = {
            type: 'submit',
            selector: getSelector(event.target),
            value: JSON.stringify(formValues),
            element: getElementInfo(event.target),
            timestamp: Date.now()
          };
          
          recordAction(action);
        }, true);

        // Track select changes
        document.addEventListener('change', (event) => {
          if (!event.target || event.target.tagName !== 'SELECT') return;
          
          const action = {
            type: 'select',
            selector: getSelector(event.target),
            value: event.target.value,
            element: getElementInfo(event.target),
            timestamp: Date.now()
          };
          
          recordAction(action);
        }, true);

        // Track scroll events (throttled)
        let scrollTimeout;
        document.addEventListener('scroll', () => {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => {
            const action = {
              type: 'scroll',
              scrollPosition: { x: window.scrollX, y: window.scrollY },
              timestamp: Date.now()
            };
            recordAction(action);
          }, 500);
        }, { passive: true });

        // Track hover events (throttled and only on interactive elements)
        let hoverTimeout;
        document.addEventListener('mouseover', (event) => {
          if (!event.target) return;
          
          const tagName = event.target.tagName;
          const isInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tagName) ||
                               event.target.onclick ||
                               event.target.getAttribute('role') === 'button';
          
          if (!isInteractive) return;
          
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            const action = {
              type: 'hover',
              selector: getSelector(event.target),
              coordinates: { x: event.clientX, y: event.clientY },
              element: getElementInfo(event.target),
              timestamp: Date.now()
            };
            recordAction(action);
          }, 100);
        }, true);

        // Track key presses (for special keys)
        document.addEventListener('keydown', (event) => {
          const specialKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
          if (!specialKeys.includes(event.key)) return;
          
          const modifiers = [];
          if (event.ctrlKey) modifiers.push('Control');
          if (event.altKey) modifiers.push('Alt');
          if (event.shiftKey) modifiers.push('Shift');
          if (event.metaKey) modifiers.push('Meta');
          
          const action = {
            type: 'keypress',
            key: event.key,
            modifiers,
            selector: event.target ? getSelector(event.target) : undefined,
            element: event.target ? getElementInfo(event.target) : undefined,
            timestamp: Date.now()
          };
          
          recordAction(action);
        }, true);

        console.log('Playwright recorder event listeners attached');
      })();
    `;

    try {
      await view.webContents.executeJavaScript(recordingScript);
      this.injectedScript = true;
      console.log('Recording script injected successfully');
    } catch (error) {
      console.error('Failed to inject recording script:', error);
      throw error;
    }
  }

  /**
   * Set up listeners for WebContents events
   */
  private setupWebContentsListeners(view: WebContentsView): void {
    const webContents = view.webContents;

    // Listen for navigation events
    const navigationHandler = (event: any, url: string) => {
      if (!this.isRecording || !this.currentSession) return;
      
      const action: RecordedAction = {
        type: 'navigate',
        url,
        timestamp: Date.now(),
        waitTime: Date.now() - this.lastActionTime
      };
      
      this.addAction(action);
    };

    // Listen for page loads to re-inject script
    const loadHandler = async () => {
      if (!this.isRecording) return;
      
      this.injectedScript = false;
      try {
        await this.injectRecordingScript(view);
      } catch (error) {
        console.error('Failed to re-inject recording script after navigation:', error);
      }
    };

    webContents.on('did-navigate', navigationHandler);
    webContents.on('did-navigate-in-page', navigationHandler);
    webContents.on('did-finish-load', loadHandler);

    // Listen for messages from injected script via executeJavaScript result
    // We'll modify the injected script to store actions and retrieve them periodically
    
    // Set up periodic polling for recorded actions (alternative to direct communication)
    const pollForActions = async () => {
      if (!this.isRecording) return;
      
      try {
        const actions = await webContents.executeJavaScript(`
          (function() {
            if (window.recordedActions && window.recordedActions.length > 0) {
              const actions = window.recordedActions.slice();
              window.recordedActions = [];
              return actions;
            }
            return [];
          })();
        `);
        
        if (actions && actions.length > 0) {
          actions.forEach((action: RecordedAction) => {
            this.addAction(action);
          });
        }
      } catch (error) {
        // Page might not be ready or script not injected
      }
      
      // Continue polling if still recording
      if (this.isRecording) {
        setTimeout(pollForActions, 500);
      }
    };
    
    // Start polling for actions
    setTimeout(pollForActions, 1000);
  }

  /**
   * Add an action to the current recording session
   */
  private addAction(action: RecordedAction): void {
    if (!this.currentSession) return;

    // Calculate wait time since last action
    if (this.currentSession.actions.length > 0) {
      action.waitTime = action.timestamp - this.lastActionTime;
    }

    this.currentSession.actions.push(action);
    this.lastActionTime = action.timestamp;

    console.log(`Recorded action: ${action.type}`, action);
  }

  /**
   * Process action received from injected script
   */
  public processActionFromPage(action: RecordedAction): void {
    if (!this.isRecording || !this.currentSession) return;
    this.addAction(action);
  }

  /**
   * Generate Playwright test code from recorded actions
   */
  public generatePlaywrightCode(session: RecordingSession): string {
    const actions = session.actions;
    if (actions.length === 0) {
      return '// No actions recorded';
    }

    let code = `// Generated Playwright test from recording session: ${session.id}\n`;
    code += `// Recorded on: ${new Date(session.startTime).toISOString()}\n`;
    code += `// URL: ${session.url}\n\n`;
    
    code += `import { test, expect } from '@playwright/test';\n\n`;
    code += `test('recorded user flow', async ({ page }) => {\n`;
    code += `  await page.goto('${session.url}');\n\n`;

    let lastWaitTime = 0;

    for (const action of actions) {
      // Add wait if there was a significant delay
      if (action.waitTime && action.waitTime > 1000) {
        code += `  await page.waitForTimeout(${Math.min(action.waitTime, 5000)});\n`;
      }

      switch (action.type) {
        case 'click':
          if (action.selector) {
            code += `  await page.click('${action.selector}');\n`;
          }
          break;
        
        case 'type':
          if (action.selector && action.value) {
            code += `  await page.fill('${action.selector}', '${action.value.replace(/'/g, "\\'")}');\n`;
          }
          break;
        
        case 'navigate':
          if (action.url) {
            code += `  await page.goto('${action.url}');\n`;
          }
          break;
        
        case 'submit':
          if (action.selector) {
            code += `  await page.click('${action.selector} [type="submit"]');\n`;
          }
          break;
        
        case 'select':
          if (action.selector && action.value) {
            code += `  await page.selectOption('${action.selector}', '${action.value}');\n`;
          }
          break;
        
        case 'scroll':
          if (action.scrollPosition) {
            code += `  await page.evaluate(() => window.scrollTo(${action.scrollPosition.x}, ${action.scrollPosition.y}));\n`;
          }
          break;
        
        case 'hover':
          if (action.selector) {
            code += `  await page.hover('${action.selector}');\n`;
          }
          break;
        
        case 'keypress':
          if (action.key) {
            const modifiers = action.modifiers?.join('+') || '';
            const keyCombo = modifiers ? `${modifiers}+${action.key}` : action.key;
            code += `  await page.keyboard.press('${keyCombo}');\n`;
          }
          break;
      }
    }

    code += `});\n`;
    return code;
  }

  /**
   * Export recording session as JSON
   */
  public exportSession(session: RecordingSession): string {
    return JSON.stringify(session, null, 2);
  }

  /**
   * Import recording session from JSON
   */
  public importSession(jsonData: string): RecordingSession | null {
    try {
      const session = JSON.parse(jsonData) as RecordingSession;
      // Validate the session structure
      if (!session.id || !session.startTime || !Array.isArray(session.actions)) {
        throw new Error('Invalid session format');
      }
      return session;
    } catch (error) {
      console.error('Failed to import session:', error);
      return null;
    }
  }
}