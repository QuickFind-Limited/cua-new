/**
 * WebView2 Bridge for Windows
 * Handles WebView2 instances in the renderer process
 */

class WebView2Bridge {
  constructor() {
    this.webviews = new Map();
    this.activeWebview = null;
    this.setupIpcListeners();
  }

  setupIpcListeners() {
    // Listen for WebView2 creation commands from main process
    window.electronAPI.onCreateWebview((data) => {
      this.createWebView(data.tabId, data.webviewId, data.url);
    });

    window.electronAPI.onRemoveWebview((webviewId) => {
      this.removeWebView(webviewId);
    });

    window.electronAPI.onSwitchWebview((webviewId) => {
      this.switchToWebView(webviewId);
    });

    window.electronAPI.onNavigateWebview((webviewId, url) => {
      this.navigateWebView(webviewId, url);
    });

    window.electronAPI.onWebviewGoBack((webviewId) => {
      const webview = this.webviews.get(webviewId);
      if (webview && webview.canGoBack()) {
        webview.goBack();
      }
    });

    window.electronAPI.onWebviewGoForward((webviewId) => {
      const webview = this.webviews.get(webviewId);
      if (webview && webview.canGoForward()) {
        webview.goForward();
      }
    });

    window.electronAPI.onWebviewReload((webviewId) => {
      const webview = this.webviews.get(webviewId);
      if (webview) {
        webview.reload();
      }
    });
  }

  createWebView(tabId, webviewId, url) {
    // Create WebView2 element
    const webview = document.createElement('webview');
    webview.id = webviewId;
    webview.src = url;
    webview.className = 'webview-content';
    
    // Enable WebView2 features
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('nodeintegration', 'false');
    webview.setAttribute('contextIsolation', 'true');
    webview.setAttribute('webpreferences', 'contextIsolation=true, nodeIntegration=false');
    
    // Add to container
    const container = document.getElementById('webview-container');
    if (container) {
      container.appendChild(webview);
      
      // Initially hidden
      webview.style.display = 'none';
      
      // Setup event listeners
      this.setupWebViewEventListeners(webview, tabId);
      
      // Store reference
      this.webviews.set(webviewId, webview);
    }
  }

  setupWebViewEventListeners(webview, tabId) {
    // Page title updated
    webview.addEventListener('page-title-updated', (e) => {
      window.electronAPI.sendWebviewTitleUpdate(tabId, e.title);
    });

    // URL changed
    webview.addEventListener('did-navigate', (e) => {
      window.electronAPI.sendWebviewUrlChange(tabId, e.url);
    });

    webview.addEventListener('did-navigate-in-page', (e) => {
      if (e.isMainFrame) {
        window.electronAPI.sendWebviewUrlChange(tabId, e.url);
      }
    });

    // Loading state
    webview.addEventListener('did-start-loading', () => {
      window.electronAPI.sendWebviewLoadingChange(tabId, true);
    });

    webview.addEventListener('did-stop-loading', () => {
      window.electronAPI.sendWebviewLoadingChange(tabId, false);
      
      // Update navigation state
      const canGoBack = webview.canGoBack();
      const canGoForward = webview.canGoForward();
      window.electronAPI.sendWebviewNavigationState(tabId, canGoBack, canGoForward);
    });

    // New window request (open in new tab)
    webview.addEventListener('new-window', (e) => {
      e.preventDefault();
      window.electronAPI.sendWebviewNewWindow(tabId, e.url);
    });

    // Handle page favicon
    webview.addEventListener('page-favicon-updated', (e) => {
      if (e.favicons && e.favicons.length > 0) {
        // Could send favicon to main process if needed
      }
    });

    // Error handling
    webview.addEventListener('did-fail-load', (e) => {
      if (e.errorCode !== -3) { // Ignore user abort
        console.error('WebView load failed:', e.errorDescription);
      }
    });

    // Console messages from WebView2
    webview.addEventListener('console-message', (e) => {
      console.log(`WebView2 [${tabId}]:`, e.message);
    });
  }

  removeWebView(webviewId) {
    const webview = this.webviews.get(webviewId);
    if (webview) {
      webview.remove();
      this.webviews.delete(webviewId);
      
      if (this.activeWebview === webview) {
        this.activeWebview = null;
      }
    }
  }

  switchToWebView(webviewId) {
    // Hide current active webview
    if (this.activeWebview) {
      this.activeWebview.style.display = 'none';
    }

    // Show new active webview
    const webview = this.webviews.get(webviewId);
    if (webview) {
      webview.style.display = 'block';
      this.activeWebview = webview;
      
      // Focus the webview
      webview.focus();
    }
  }

  navigateWebView(webviewId, url) {
    const webview = this.webviews.get(webviewId);
    if (webview) {
      webview.src = url;
    }
  }

  // Get current WebView2 for recording
  getActiveWebView() {
    return this.activeWebview;
  }

  // Inject recording script into active WebView2
  async injectRecordingScript(script) {
    if (this.activeWebview) {
      try {
        await this.activeWebview.executeJavaScript(script);
        return true;
      } catch (error) {
        console.error('Failed to inject recording script:', error);
        return false;
      }
    }
    return false;
  }
}

// Initialize bridge when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.webview2Bridge = new WebView2Bridge();
  });
} else {
  window.webview2Bridge = new WebView2Bridge();
}