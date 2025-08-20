// Tab management and IPC communication with main process

let activeTabId = null;
let tabs = new Map();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing tab manager...');
    console.log('📋 Available electronAPI methods:', Object.keys(window.electronAPI || {}));
    initializeUI();
    // Initial tab will be created by main process
});

function initializeUI() {
    // Set up new tab button
    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn) {
        newTabBtn.addEventListener('click', () => createNewTab());
    }

    // Set up navigation buttons
    const backBtn = document.getElementById('back-btn');
    const forwardBtn = document.getElementById('forward-btn');
    const reloadBtn = document.getElementById('reload-btn');
    const goBtn = document.getElementById('go-btn');
    const addressBar = document.getElementById('address-bar');
    const launcherBtn = document.getElementById('launcher-btn');
    const settingsBtn = document.getElementById('settings-btn');

    if (backBtn) {
        console.log('🔙 Back button found, adding event listener');
        backBtn.addEventListener('click', () => {
            console.log('🔙 Back button clicked directly');
            navigateBack();
        });
    } else {
        console.error('❌ Back button not found!');
    }
    
    if (forwardBtn) {
        console.log('🔜 Forward button found, adding event listener');
        forwardBtn.addEventListener('click', () => {
            console.log('🔜 Forward button clicked directly');
            navigateForward();
        });
    } else {
        console.error('❌ Forward button not found!');
    }
    if (reloadBtn) reloadBtn.addEventListener('click', () => reloadPage());
    if (goBtn) goBtn.addEventListener('click', () => navigateToUrl());
    if (launcherBtn) launcherBtn.addEventListener('click', () => launchPlaywrightRecorder());
    if (settingsBtn) settingsBtn.addEventListener('click', () => openSettings());

    // Address bar enter key
    if (addressBar) {
        addressBar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                navigateToUrl();
            }
        });
    }

    // Listen for tab updates from main process
    if (window.electronAPI) {
        window.electronAPI.onTabsUpdated((data) => {
            updateTabDisplay(data.tabs, data.activeTabId);
        });

        window.electronAPI.onNavigationUpdate((data) => {
            updateNavigationState(data);
        });

        window.electronAPI.onTabTitleUpdate((tabId, title) => {
            updateTabTitle(tabId, title);
        });

        window.electronAPI.onTabUrlUpdate((tabId, url) => {
            updateTabUrl(tabId, url);
            if (tabId === activeTabId) {
                updateAddressBar(url);
            }
        });

        // Listen for recording completion
        window.electronAPI.onRecordingComplete && window.electronAPI.onRecordingComplete((intentSpec) => {
            handleRecordingComplete(intentSpec);
        });
    }
}

function createInitialTab() {
    const tabId = 'tab-' + Date.now();
    const tab = {
        id: tabId,
        title: 'Google',
        url: 'https://www.google.com',
        active: true
    };
    
    tabs.set(tabId, tab);
    activeTabId = tabId;
    
    // Add tab to UI
    addTabToUI(tab);
    
    // Send IPC message to create tab in main process
    if (window.electronAPI) {
        window.electronAPI.createTab(tab.url);
    }
    
    // Update status
    updateStatus();
}

function createNewTab(url = 'https://www.google.com') {
    const tabId = 'tab-' + Date.now();
    const tab = {
        id: tabId,
        title: 'New Tab',
        url: url,
        active: false
    };
    
    tabs.set(tabId, tab);
    
    // Add tab to UI
    addTabToUI(tab);
    
    // Send IPC message to create tab in main process
    if (window.electronAPI) {
        window.electronAPI.createTab(url);
    }
    
    // Switch to new tab
    switchToTab(tabId);
    
    // Update status
    updateStatus();
}

function addTabToUI(tab) {
    const tabsContainer = document.getElementById('tabs-container');
    if (!tabsContainer) return;
    
    const tabElement = document.createElement('div');
    tabElement.className = 'tab' + (tab.active ? ' active' : '');
    tabElement.dataset.tabId = tab.id;
    tabElement.innerHTML = `
        <span class="tab-title">${tab.title}</span>
        <button class="tab-close" onclick="closeTab('${tab.id}')">×</button>
    `;
    
    tabElement.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
            switchToTab(tab.id);
        }
    });
    
    // Insert tab before the + button (which is the last child)
    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn && newTabBtn.parentNode === tabsContainer) {
        tabsContainer.insertBefore(tabElement, newTabBtn);
    } else {
        tabsContainer.appendChild(tabElement);
    }
}

function switchToTab(tabId) {
    // Update active state
    tabs.forEach((tab, id) => {
        tab.active = (id === tabId);
    });
    activeTabId = tabId;
    
    // Update tab UI
    document.querySelectorAll('.tab').forEach(el => {
        if (el.dataset.tabId === tabId) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    
    // Send IPC message to switch tab in main process
    if (window.electronAPI) {
        window.electronAPI.switchTab(tabId);
    }
    
    // Update address bar with current tab URL
    const tab = tabs.get(tabId);
    if (tab) {
        updateAddressBar(tab.url);
    }
}

function closeTab(tabId) {
    // Don't close if it's the only tab
    if (tabs.size <= 1) return;
    
    // Remove tab from map
    tabs.delete(tabId);
    
    // Remove tab element
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) tabElement.remove();
    
    // Send IPC message to close tab in main process
    if (window.electronAPI) {
        window.electronAPI.closeTab(tabId);
    }
    
    // If this was the active tab, switch to another
    if (activeTabId === tabId) {
        const firstTab = tabs.keys().next().value;
        if (firstTab) {
            switchToTab(firstTab);
        }
    }
    
    updateStatus();
}

function updateTabTitle(tabId, title) {
    const tab = tabs.get(tabId);
    if (tab) {
        tab.title = title || 'New Tab';
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"] .tab-title`);
        if (tabElement) {
            tabElement.textContent = tab.title;
        }
    }
}

function updateTabUrl(tabId, url) {
    const tab = tabs.get(tabId);
    if (tab) {
        tab.url = url;
    }
}

function updateAddressBar(url) {
    const addressBar = document.getElementById('address-bar');
    if (addressBar) {
        addressBar.value = url || '';
    }
}

function navigateToUrl() {
    const addressBar = document.getElementById('address-bar');
    if (!addressBar) return;
    
    let url = addressBar.value.trim();
    if (!url) return;
    
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // Check if it looks like a URL
        if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
        } else {
            // Treat as search
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
    }
    
    // Send IPC message to navigate current tab
    if (window.electronAPI && activeTabId) {
        window.electronAPI.navigateTab(activeTabId, url);
    }
}

async function navigateBack() {
    console.log('🔙 Back button clicked, activeTabId:', activeTabId);
    if (window.electronAPI && activeTabId) {
        try {
            const result = await window.electronAPI.goBack(activeTabId);
            console.log('🔙 Navigation back result:', result);
        } catch (error) {
            console.error('❌ Navigation back error:', error);
        }
    } else {
        console.error('❌ No electronAPI or activeTabId available');
    }
}

async function navigateForward() {
    console.log('🔜 Forward button clicked, activeTabId:', activeTabId);
    if (window.electronAPI && activeTabId) {
        try {
            const result = await window.electronAPI.goForward(activeTabId);
            console.log('🔜 Navigation forward result:', result);
        } catch (error) {
            console.error('❌ Navigation forward error:', error);
        }
    } else {
        console.error('❌ No electronAPI or activeTabId available');
    }
}

function reloadPage() {
    if (window.electronAPI && activeTabId) {
        window.electronAPI.reloadTab(activeTabId);
    }
}

function updateNavigationState(data) {
    const backBtn = document.getElementById('back-btn');
    const forwardBtn = document.getElementById('forward-btn');
    
    if (backBtn) {
        backBtn.disabled = !data.canGoBack;
    }
    if (forwardBtn) {
        forwardBtn.disabled = !data.canGoForward;
    }
}

// Global variables for recorder state
let recorderMonitorInterval = null;
let currentRecordingPath = null;
let isMonitoringRecorder = false;
let lastRecordingData = null;

async function launchPlaywrightRecorder() {
    const launcherBtn = document.getElementById('launcher-btn');
    if (!launcherBtn) return;
    
    if (isMonitoringRecorder) {
        console.log('Recorder already monitoring...');
        return;
    }
    
    console.log('Launching Playwright recorder...');
    
    try {
        // Get current URL from address bar or use default
        const addressBar = document.getElementById('address-bar');
        const startUrl = addressBar ? addressBar.value : 'https://www.google.com';
        
        // Launch the recorder
        if (window.electronAPI && window.electronAPI.launchRecorder) {
            const result = await window.electronAPI.launchRecorder(startUrl);
            
            if (result.success) {
                console.log('Playwright recorder launched successfully');
                
                // Update button to show monitoring state
                launcherBtn.classList.add('monitoring');
                launcherBtn.querySelector('.launcher-text').textContent = 'Monitoring Recording';
                
                // Start monitoring for recording completion
                startRecorderMonitoring();
                isMonitoringRecorder = true;
            } else {
                console.error('Failed to launch recorder:', result.error);
                showRecordingError('Failed to launch recorder: ' + (result.error || 'Unknown error'));
            }
        } else {
            console.error('Launch recorder API not available');
        }
    } catch (error) {
        console.error('Error launching recorder:', error);
        showRecordingError('Error launching recorder: ' + error.message);
    }
}

// Start monitoring the recorder process and file
function startRecorderMonitoring() {
    console.log('Starting recorder monitoring...');
    
    // Listen for recorder events from main process
    if (window.electronAPI) {
        // Listen for when recording is launched
        if (window.electronAPI.onRecordingLaunched) {
            window.electronAPI.onRecordingLaunched((data) => {
                console.log('Recording launched:', data);
            });
        }
        
        // Listen for when recording starts (file detected)
        if (window.electronAPI.onRecordingStarted) {
            window.electronAPI.onRecordingStarted((data) => {
                console.log('Recording started:', data);
                lastRecordingData = data;
                // Show Begin Analysis button immediately (disabled initially)
                showBeginAnalysisButton(data.buttonEnabled || false);
            });
        }
        
        // Listen for when browser closes (enable the button)
        if (window.electronAPI.onBrowserClosed) {
            window.electronAPI.onBrowserClosed((data) => {
                console.log('Browser closed, enabling button');
                // Only enable the button if analysis hasn't started
                const beginAnalysisBtn = document.getElementById('begin-analysis-btn');
                if (beginAnalysisBtn) {
                    // Check if analysis is already in progress
                    // Don't enable if button text is "Analyzing..." or sidebar is showing
                    const isAnalyzing = beginAnalysisBtn.textContent === 'Analyzing...' || 
                                       beginAnalysisBtn.classList.contains('analyzing');
                    const sidebarVisible = document.getElementById('analysis-sidebar')?.classList.contains('open');
                    
                    if (!isAnalyzing && !sidebarVisible) {
                        beginAnalysisBtn.disabled = false;
                        beginAnalysisBtn.title = 'Analyze Recording';
                    } else {
                        console.log('Analysis in progress, keeping button disabled');
                    }
                }
            });
        }
        
        // Listen for when recording is saved
        if (window.electronAPI.onRecordingSaved) {
            window.electronAPI.onRecordingSaved((data) => {
                console.log('Recording saved:', data);
                lastRecordingData = data;
            });
        }
        
        // Listen for when recording is complete
        if (window.electronAPI.onRecordingComplete) {
            window.electronAPI.onRecordingComplete((data) => {
                console.log('Recording complete:', data);
                lastRecordingData = data;
            });
        }
        
        // Listen for when recording is cancelled
        if (window.electronAPI.onRecordingCancelled) {
            window.electronAPI.onRecordingCancelled((data) => {
                console.log('Recording cancelled:', data);
            });
        }
        
        // Listen for when recorder process exits
        if (window.electronAPI.onRecorderExit) {
            window.electronAPI.onRecorderExit((data) => {
                console.log('Recorder exited:', data);
                handleRecorderExit(data);
            });
        }
    }
    
    // Also poll periodically to check recorder status
    recorderMonitorInterval = setInterval(async () => {
        try {
            if (window.electronAPI && window.electronAPI.getRecorderStatus) {
                const status = await window.electronAPI.getRecorderStatus();
                
                if (!status.isRecording && lastRecordingData) {
                    // Recorder has stopped and we have recording data
                    handleRecorderExit({ hasRecording: true });
                }
            }
        } catch (error) {
            console.error('Error checking recorder status:', error);
        }
    }, 2000); // Check every 2 seconds
}

// Show Begin Analysis button immediately when recording starts
function showBeginAnalysisButton(enabled = false) {
    console.log('Showing Begin Analysis button, enabled:', enabled);
    
    const recordingControls = document.querySelector('.recording-controls');
    if (recordingControls) {
        recordingControls.innerHTML = `
            <button class="begin-analysis-btn" id="begin-analysis-btn" title="${enabled ? 'Analyze Recording' : 'Close browser to enable'}" ${enabled ? '' : 'disabled'}>
                <span class="analysis-text">Begin Analysis</span>
            </button>
        `;
        
        // Add event listener to begin analysis button
        const beginAnalysisBtn = document.getElementById('begin-analysis-btn');
        if (beginAnalysisBtn) {
            beginAnalysisBtn.addEventListener('click', async () => {
                console.log('Begin analysis clicked');
                await analyzeRecording();
            });
        }
    }
}

// Handle when recorder process exits
function handleRecorderExit(data) {
    console.log('Handling recorder exit:', data);
    
    // Stop monitoring
    if (recorderMonitorInterval) {
        clearInterval(recorderMonitorInterval);
        recorderMonitorInterval = null;
    }
    isMonitoringRecorder = false;
    
    const launcherBtn = document.getElementById('launcher-btn');
    const recordingControls = document.querySelector('.recording-controls');
    
    if (data.hasRecording || lastRecordingData) {
        // Recording was saved, show Begin Analysis button
        console.log('Recording available, showing Begin Analysis button');
        
        if (recordingControls) {
            recordingControls.innerHTML = `
                <button class="begin-analysis-btn" id="begin-analysis-btn" title="Analyze Recording">
                    <span class="analysis-text">Begin Analysis</span>
                </button>
            `;
            
            // Add event listener to begin analysis button
            const beginAnalysisBtn = document.getElementById('begin-analysis-btn');
            if (beginAnalysisBtn) {
                beginAnalysisBtn.addEventListener('click', async () => {
                    console.log('Begin analysis clicked');
                    await analyzeRecording();
                });
            }
        }
    } else {
        // No recording, restore Launch Recorder button
        console.log('No recording saved, restoring Launch Recorder button');
        
        if (launcherBtn) {
            launcherBtn.classList.remove('monitoring');
            launcherBtn.querySelector('.launcher-text').textContent = 'Launch Recorder';
        }
    }
}

// Analyze the recorded Playwright spec
async function analyzeRecording() {
    console.log('Starting analysis of recording...');
    
    const beginAnalysisBtn = document.getElementById('begin-analysis-btn');
    if (beginAnalysisBtn) {
        beginAnalysisBtn.disabled = true;
        beginAnalysisBtn.classList.add('analyzing');
        beginAnalysisBtn.querySelector('.analysis-text').textContent = 'Analyzing...';
    }
    
    // Get the recording data (either from lastRecordingData or from the saved file)
    let recordingData = lastRecordingData;
    
    if (!recordingData && window.electronAPI && window.electronAPI.getLastRecording) {
        recordingData = await window.electronAPI.getLastRecording();
    }
    
    if (recordingData && recordingData.specCode) {
        // Create a session object for compatibility
        const session = {
            id: recordingData.sessionId || Date.now().toString(),
            url: recordingData.url || 'https://www.google.com',
            title: 'Recorded Flow',
            specCode: recordingData.specCode,
            path: recordingData.path
        };
        
        // Store for analysis
        window.lastRecordingSession = session;
        
        // Trigger analysis
        await analyzeLastRecording();
        
        // After analysis, restore the Launch Recorder button
        const recordingControls = document.querySelector('.recording-controls');
        if (recordingControls) {
            recordingControls.innerHTML = `
                <button class="launcher-btn" id="launcher-btn" title="Launch Playwright Recorder">
                    <span class="launcher-text">Launch Recorder</span>
                </button>
            `;
            
            // Re-add event listener
            const newLauncherBtn = document.getElementById('launcher-btn');
            if (newLauncherBtn) {
                newLauncherBtn.addEventListener('click', () => launchPlaywrightRecorder());
            }
        }
    } else {
        console.error('No recording data available for analysis');
        showRecordingError('No recording data available');
        
        if (beginAnalysisBtn) {
            beginAnalysisBtn.disabled = false;
            beginAnalysisBtn.querySelector('.analysis-text').textContent = 'Begin Analysis';
        }
    }
}

// Handle completed recording data (kept for IPC listener compatibility)
function handleRecordingComplete(session) {
    console.log('Recording session complete (stop button clicked):', session);
    
    // Store the recording session for analysis
    window.lastRecordingSession = session;
    lastRecordingData = session;
    
    // Stop monitoring since recording is complete
    if (recorderMonitorInterval) {
        clearInterval(recorderMonitorInterval);
        recorderMonitorInterval = null;
    }
    isMonitoringRecorder = false;
    
    // Show Begin Analysis button immediately
    const recordingControls = document.querySelector('.recording-controls');
    if (recordingControls) {
        console.log('Showing Begin Analysis button after stop button click');
        recordingControls.innerHTML = `
            <button class="begin-analysis-btn" id="begin-analysis-btn" title="Analyze Recording">
                <span class="analysis-text">Begin Analysis</span>
            </button>
        `;
        
        // Add event listener to begin analysis button
        const beginAnalysisBtn = document.getElementById('begin-analysis-btn');
        if (beginAnalysisBtn) {
            beginAnalysisBtn.addEventListener('click', async () => {
                console.log('Begin analysis clicked');
                await analyzeRecording();
            });
        }
    }
    
    // Show recording summary
    showRecordingSummary(session);
    
    // Optionally trigger onRecordingComplete callback if set
    if (window.recordingCompleteCallback) {
        window.recordingCompleteCallback(session);
    }
    
    // Emit custom event for other parts of the app to listen to
    window.dispatchEvent(new CustomEvent('recordingComplete', { detail: session }));
}

// Show recording summary in UI
function showRecordingSummary(session) {
    const statusText = document.getElementById('status-text');
    
    // Handle both old format (with actions) and new format (with session/specCode)
    const actualSession = session.session || session;
    const hasActions = session.actions && Array.isArray(session.actions);
    
    if (statusText) {
        if (hasActions) {
            statusText.textContent = `Recording complete: ${session.actions.length} actions captured`;
        } else {
            statusText.textContent = `Recording complete - ready for analysis`;
        }
        
        // Reset status after 5 seconds
        setTimeout(() => {
            statusText.textContent = 'Ready';
        }, 5000);
    }
    
    // Log detailed summary to console
    console.group('Recording Summary');
    console.log('Session ID:', actualSession.id);
    
    if (actualSession.startTime && actualSession.endTime) {
        console.log('Duration:', ((actualSession.endTime - actualSession.startTime) / 1000).toFixed(1) + 's');
    }
    
    if (hasActions) {
        console.log('Actions:', session.actions.length);
        // Group actions by type
        const actionsByType = {};
        session.actions.forEach(action => {
            actionsByType[action.type] = (actionsByType[action.type] || 0) + 1;
        });
        console.log('Action breakdown:', actionsByType);
    } else if (session.specCode) {
        console.log('Playwright spec generated');
        console.log('Spec length:', session.specCode.length, 'characters');
    }
    
    console.log('URL:', actualSession.url);
    console.log('Title:', actualSession.title);
    
    if (session.screenshotPath || actualSession.screenshotPath) {
        console.log('Screenshot:', session.screenshotPath || actualSession.screenshotPath);
    }
    
    console.groupEnd();
}

// Show recording status message
function showRecordingStatus(message) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = message;
        
        // Reset status after 3 seconds
        setTimeout(() => {
            statusText.textContent = 'Ready';
        }, 3000);
    }
}

// Show recording error message
function showRecordingError(errorMessage) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = errorMessage;
        statusText.style.color = '#ff6b6b';
        
        // Reset status and color after 5 seconds
        setTimeout(() => {
            statusText.textContent = 'Ready';
            statusText.style.color = '';
        }, 5000);
    }
    
    console.error('Recording Error:', errorMessage);
}

// Function to set a callback for recording completion
function onRecordingComplete(callback) {
    window.recordingCompleteCallback = callback;
}

// Make functions globally available
window.onRecordingComplete = onRecordingComplete;

// Analysis Progress Sidebar Management
class AnalysisSidebar {
    constructor() {
        this.sidebar = document.getElementById('analysis-sidebar');
        this.toggleBtn = document.getElementById('sidebar-toggle-btn');
        // Timer element removed
        this.detailContent = document.getElementById('detail-content');
        this.isCollapsed = false;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }
    }
    
    show() {
        if (this.sidebar) {
            this.sidebar.classList.add('active');
            document.body.classList.add('sidebar-visible');
            // Timer removed
            this.resetProgress();
        }
    }
    
    hide() {
        if (this.sidebar) {
            this.sidebar.classList.remove('active');
            document.body.classList.remove('sidebar-visible');
            // Timer removed
        }
    }
    
    toggle() {
        this.isCollapsed = !this.isCollapsed;
        if (this.sidebar) {
            if (this.isCollapsed) {
                this.sidebar.classList.add('collapsed');
                document.body.classList.remove('sidebar-visible');
                this.toggleBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>`;
                this.toggleBtn.title = 'Expand';
            } else {
                this.sidebar.classList.remove('collapsed');
                document.body.classList.add('sidebar-visible');
                this.toggleBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>`;
                this.toggleBtn.title = 'Collapse';
            }
        }
    }
    
    // Timer methods removed
    
    resetProgress() {
        // Reset all progress items
        const items = ['recording', 'parsing', 'analyzing', 'variables', 'generating', 'validating'];
        items.forEach(item => {
            const element = document.getElementById(`progress-${item}`);
            if (element) {
                element.classList.remove('active', 'completed');
                const statusElement = element.querySelector('.progress-status');
                if (statusElement && item !== 'recording') {
                    statusElement.textContent = '';
                }
            }
        });
        
        // Mark recording as completed since we're analyzing
        const recordingItem = document.getElementById('progress-recording');
        if (recordingItem) {
            recordingItem.classList.add('completed');
        }
        
        // Clear details
        if (this.detailContent) {
            this.detailContent.innerHTML = '<div class="detail-item">Analysis starting...</div>';
        }
    }
    
    updateProgress(step, status = 'active', details = null) {
        const element = document.getElementById(`progress-${step}`);
        if (element) {
            // Remove active from all
            document.querySelectorAll('.progress-item.active').forEach(item => {
                item.classList.remove('active');
            });
            
            if (status === 'active') {
                element.classList.add('active');
                element.classList.remove('completed');
            } else if (status === 'completed') {
                element.classList.remove('active');
                element.classList.add('completed');
                const statusElement = element.querySelector('.progress-status');
                if (statusElement) {
                    statusElement.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007acc" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>`;
                }
            }
        }
        
        // Update details if provided
        if (details && this.detailContent) {
            const detailItem = document.createElement('div');
            detailItem.className = 'detail-item';
            detailItem.textContent = details;
            this.detailContent.appendChild(detailItem);
            // Keep only last 10 items
            while (this.detailContent.children.length > 10) {
                this.detailContent.removeChild(this.detailContent.firstChild);
            }
            // Scroll to bottom
            this.detailContent.scrollTop = this.detailContent.scrollHeight;
        }
    }
    
    completeAnalysis(success = true) {
        this.stopTimer();
        if (success) {
            this.updateProgress('validating', 'completed', 'Analysis completed successfully!');
        } else {
            if (this.detailContent) {
                const detailItem = document.createElement('div');
                detailItem.className = 'detail-item';
                detailItem.style.color = '#ef4444';
                detailItem.textContent = 'Analysis failed. Please check the console for details.';
                this.detailContent.appendChild(detailItem);
            }
        }
    }
}

// Initialize sidebar (use modern sidebar if available, fallback to old)
const analysisSidebar = window.modernSidebar || new AnalysisSidebar();

// Analyze the last recording
async function analyzeLastRecording() {
    console.log('==========================================');
    console.log('analyzeLastRecording function called!');
    console.log('lastRecordingSession exists:', !!window.lastRecordingSession);
    console.log('==========================================');
    
    if (!window.lastRecordingSession) {
        showRecordingError('No recording available to analyze');
        return;
    }
    
    const analyzeBtn = document.getElementById('analyze-btn');
    const statusText = document.getElementById('status-text');
    
    if (analyzeBtn) {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';
        analyzeBtn.classList.add('analyzing');
    }
    
    if (statusText) {
        statusText.textContent = 'Analyzing recording...';
    }
    
    // Show the modern sidebar
    console.log('Checking for modernSidebar:', !!window.modernSidebar);
    if (window.modernSidebar) {
        // Force reset the sidebar state before showing
        window.modernSidebar.isVisible = false;
        console.log('Force reset sidebar visibility, calling show()');
        await window.modernSidebar.show();
        console.log('Starting analysis flow...');
        // Don't immediately update parsing - wait for actual parsing to begin
    } else {
        console.log('Falling back to analysisSidebar');
        // Fallback to old sidebar
        analysisSidebar.show();
    }
    
    try {
        if (window.electronAPI && window.electronAPI.analyzeRecording) {
            // Prepare recording data for analysis
            // Send the actual recording session with actions, not just spec code
            const recordingSession = window.lastRecordingSession;
            
            console.log('Recording session object:', recordingSession);
            console.log('Number of actions:', recordingSession.actions ? recordingSession.actions.length : 0);
            
            // Send the spec code for analysis (Playwright codegen generates spec code)
            const recordingData = {
                recordingData: recordingSession.specCode || '',
                url: recordingSession.url || '',
                title: recordingSession.title || 'Recording',
                screenshotPath: recordingSession.screenshotPath
            };
            
            console.log('Sending recording for analysis:', recordingData);
            console.log('Recording data is valid:', !!recordingData.recordingData);
            
            // Use modern sidebar if available
            const sidebar = window.modernSidebar || analysisSidebar;
            
            // Listen for progress updates from backend
            if (window.electronAPI && window.electronAPI.onAnalysisProgress) {
                window.electronAPI.onAnalysisProgress((progress) => {
                    console.log('Analysis progress update:', progress);
                    sidebar.updateProgress(progress.step, progress.status, progress.message);
                    
                    // If validation is completed, complete the analysis
                    if (progress.step === 'validating' && progress.status === 'completed') {
                        sidebar.completeAnalysis(true);
                    }
                });
            }
            
            console.log('About to call electronAPI.analyzeRecording...');
            
            // The actual analysis call - backend will send progress events
            const result = await window.electronAPI.analyzeRecording(recordingData);
            console.log('IPC call returned:', result);
            
            if (result.success && result.data) {
                console.log('Analysis successful:', result.data);
                console.log('Intent Spec:', JSON.stringify(result.data.intentSpec, null, 2));
                
                // Keep analyze button visible for testing
                // if (analyzeBtn) {
                //     analyzeBtn.style.display = 'none';
                // }
                
                // Show vars panel with the Intent Spec (not the entire data object)
                if (result.data.intentSpec) {
                    showVarsPanel(result.data.intentSpec);
                } else {
                    console.error('No intentSpec found in result.data');
                    showVarsPanel(result.data); // Fallback to old behavior
                }
                
                if (statusText) {
                    statusText.textContent = 'Analysis complete - Intent Spec generated';
                }
            } else {
                throw new Error(result.error || 'Analysis failed');
            }
        } else {
            throw new Error('Analysis API not available');
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showRecordingError('Analysis failed: ' + error.message);
        
        // Update sidebar to show failure
        const sidebar = window.modernSidebar || analysisSidebar;
        sidebar.completeAnalysis(false);
    } finally {
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze';
            analyzeBtn.classList.remove('analyzing');
        }
    }
}

// Legacy function for compatibility (if needed elsewhere)
function handleRecordingCompleteIntent(intentSpec) {
    console.log('Recording completed, showing vars panel with Intent Spec:', intentSpec);
    // Reset recording button
    const recordBtn = document.getElementById('record-btn');
    if (recordBtn) {
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.record-text').textContent = 'Record';
    }
    
    // Show vars panel with the Intent Spec
    showVarsPanel(intentSpec);
}

function showVarsPanel(intentSpec) {
    // Access the vars panel manager from the global scope
    if (window.varsPanelManager) {
        window.varsPanelManager.showVarsPanel(intentSpec);
    } else {
        console.error('VarsPanelManager not available');
    }
}

function hideVarsPanel() {
    if (window.varsPanelManager) {
        window.varsPanelManager.hideVarsPanel();
    }
}

function updateStatus() {
    const statusText = document.getElementById('status-text');
    const tabCount = document.getElementById('tab-count');
    
    if (statusText) statusText.textContent = 'Ready';
    if (tabCount) tabCount.textContent = `${tabs.size} tab${tabs.size !== 1 ? 's' : ''}`;
}

function updateTabDisplay(tabsData, activeId) {
    // Update from main process if needed
    console.log('Tab update from main:', tabsData, activeId);
    
    // Sync local tabs with main process data
    if (tabsData) {
        tabs.clear();
        const tabsContainer = document.getElementById('tabs-container');
        if (tabsContainer) {
            // Save the + button before clearing
            const newTabBtn = document.getElementById('new-tab-btn');
            const savedBtn = newTabBtn ? newTabBtn.cloneNode(true) : null;
            
            // Clear all tabs
            tabsContainer.innerHTML = '';
            
            // Always ensure + button exists
            if (savedBtn) {
                tabsContainer.appendChild(savedBtn);
                // Re-attach event listener since cloneNode doesn't copy listeners
                savedBtn.addEventListener('click', () => createNewTab());
            } else {
                // Create + button if it doesn't exist
                const plusBtn = document.createElement('button');
                plusBtn.className = 'new-tab-btn';
                plusBtn.id = 'new-tab-btn';
                plusBtn.title = 'New Tab';
                plusBtn.textContent = '+';
                plusBtn.addEventListener('click', () => createNewTab());
                tabsContainer.appendChild(plusBtn);
            }
        }
        
        tabsData.forEach(tabData => {
            tabs.set(tabData.id, tabData);
            addTabToUI(tabData);
        });
        
        activeTabId = activeId;
        
        // Update UI to reflect active tab
        document.querySelectorAll('.tab').forEach(el => {
            if (el.dataset.tabId === activeId) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
        
        // Update address bar
        const activeTab = tabs.get(activeId);
        if (activeTab) {
            updateAddressBar(activeTab.url);
        }
        
        updateStatus();
    }
}

// Settings window functionality
function openSettings() {
    console.log('Opening settings window...');
    
    // Create a new tab for settings
    if (window.electronAPI && window.electronAPI.createTab) {
        const settingsUrl = 'error-recovery-settings.html';
        window.electronAPI.createTab(settingsUrl)
            .then(result => {
                console.log('Settings tab created:', result);
            })
            .catch(error => {
                console.error('Failed to create settings tab:', error);
                // Fallback: open in new window
                openSettingsInNewWindow();
            });
    } else {
        openSettingsInNewWindow();
    }
}

function openSettingsInNewWindow() {
    // Open settings in a new browser window as fallback
    const settingsWindow = window.open('error-recovery-settings.html', 'settings', 
        'width=900,height=700,scrollbars=yes,resizable=yes');
    
    if (!settingsWindow) {
        console.error('Failed to open settings window - popup blocked?');
        alert('Settings window was blocked. Please allow popups for this application.');
    }
}

// Make functions globally available for onclick handlers and external access
window.closeTab = closeTab;
window.showVarsPanel = showVarsPanel;
window.hideVarsPanel = hideVarsPanel;
window.handleRecordingComplete = handleRecordingComplete;
window.analyzeLastRecording = analyzeLastRecording;
window.openSettings = openSettings;