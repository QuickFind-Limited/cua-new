// Tab management and IPC communication with main process

let activeTabId = null;
let tabs = new Map();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing tab manager...');
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
    const recordBtn = document.getElementById('record-btn');

    if (backBtn) backBtn.addEventListener('click', () => navigateBack());
    if (forwardBtn) forwardBtn.addEventListener('click', () => navigateForward());
    if (reloadBtn) reloadBtn.addEventListener('click', () => reloadPage());
    if (goBtn) goBtn.addEventListener('click', () => navigateToUrl());
    if (recordBtn) recordBtn.addEventListener('click', () => toggleRecording());

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
    
    tabsContainer.appendChild(tabElement);
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

function navigateBack() {
    if (window.electronAPI && activeTabId) {
        window.electronAPI.navigateBack(activeTabId);
    }
}

function navigateForward() {
    if (window.electronAPI && activeTabId) {
        window.electronAPI.navigateForward(activeTabId);
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

function toggleRecording() {
    const recordBtn = document.getElementById('record-btn');
    if (!recordBtn) return;
    
    if (recordBtn.classList.contains('recording')) {
        // Stop recording
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.record-text').textContent = 'Record';
        console.log('Recording stopped');
        
        // Send IPC message to stop recording
        if (window.electronAPI) {
            window.electronAPI.stopRecording();
        }
    } else {
        // Start recording
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.record-text').textContent = 'Stop';
        console.log('Recording started');
        
        // Send IPC message to start recording
        if (window.electronAPI) {
            window.electronAPI.startRecording();
        }
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
            tabsContainer.innerHTML = '';
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

// Make closeTab globally available for onclick handlers
window.closeTab = closeTab;