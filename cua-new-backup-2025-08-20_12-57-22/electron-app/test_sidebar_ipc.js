// Test sidebar functionality via IPC with screenshots
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function takeScreenshot(filename) {
    const scriptPath = path.join(__dirname, 'take_screenshot.ps1');
    const imagePath = path.join(__dirname, filename);
    try {
        execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" "${imagePath}"`, { stdio: 'inherit' });
        console.log(`✅ Screenshot taken: ${filename}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to take screenshot: ${error.message}`);
        return false;
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function injectSidebarControl() {
    // Connect to the running Electron app via CDP
    const CDP = require('chrome-remote-interface');
    
    try {
        const client = await CDP({ port: 9222 });
        const { Runtime, Page } = client;
        
        await Runtime.enable();
        await Page.enable();
        
        console.log('📡 Connected to Electron app via CDP');
        
        // Step 1: Initial state screenshot
        console.log('\n🔍 Step 1: Taking initial state screenshot');
        await takeScreenshot('step1_initial_state.png');
        await sleep(1000);
        
        // Step 2: Show sidebar via IPC
        console.log('\n🔍 Step 2: Showing sidebar via IPC');
        const showResult = await Runtime.evaluate({
            expression: `
                (async function() {
                    if (window.modernSidebar) {
                        console.log('Found modernSidebar, calling show()');
                        await window.modernSidebar.show();
                        return 'Sidebar shown via modernSidebar.show()';
                    } else if (window.electronAPI && window.electronAPI.sidebar) {
                        console.log('Found electronAPI.sidebar, calling toggle(true)');
                        const result = await window.electronAPI.sidebar.toggle(true);
                        return 'Sidebar shown via electronAPI: ' + JSON.stringify(result);
                    } else {
                        return 'No sidebar API found';
                    }
                })()
            `,
            awaitPromise: true
        });
        
        console.log('Show result:', showResult.result.value);
        await sleep(2000); // Wait for animation
        
        await takeScreenshot('step2_sidebar_expanded.png');
        
        // Step 3: Collapse sidebar (but keep visible)
        console.log('\n🔍 Step 3: Collapsing sidebar (keeping it visible)');
        const collapseResult = await Runtime.evaluate({
            expression: `
                (async function() {
                    if (window.modernSidebar) {
                        console.log('Calling toggleCollapse()');
                        await window.modernSidebar.toggleCollapse();
                        return 'Sidebar collapsed via modernSidebar.toggleCollapse()';
                    } else {
                        return 'No sidebar API found for collapse';
                    }
                })()
            `,
            awaitPromise: true
        });
        
        console.log('Collapse result:', collapseResult.result.value);
        await sleep(2000); // Wait for animation
        
        await takeScreenshot('step3_sidebar_collapsed.png');
        
        // Step 4: Expand again
        console.log('\n🔍 Step 4: Expanding sidebar again');
        const expandResult = await Runtime.evaluate({
            expression: `
                (async function() {
                    if (window.modernSidebar) {
                        console.log('Calling toggleCollapse() to expand');
                        await window.modernSidebar.toggleCollapse();
                        return 'Sidebar expanded via modernSidebar.toggleCollapse()';
                    } else {
                        return 'No sidebar API found for expand';
                    }
                })()
            `,
            awaitPromise: true
        });
        
        console.log('Expand result:', expandResult.result.value);
        await sleep(2000); // Wait for animation
        
        await takeScreenshot('step4_sidebar_expanded_again.png');
        
        // Step 5: Hide sidebar completely
        console.log('\n🔍 Step 5: Hiding sidebar completely');
        const hideResult = await Runtime.evaluate({
            expression: `
                (async function() {
                    if (window.modernSidebar) {
                        console.log('Calling hide()');
                        await window.modernSidebar.hide();
                        return 'Sidebar hidden via modernSidebar.hide()';
                    } else if (window.electronAPI && window.electronAPI.sidebar) {
                        const result = await window.electronAPI.sidebar.toggle(false);
                        return 'Sidebar hidden via electronAPI: ' + JSON.stringify(result);
                    } else {
                        return 'No sidebar API found for hide';
                    }
                })()
            `,
            awaitPromise: true
        });
        
        console.log('Hide result:', hideResult.result.value);
        await sleep(2000); // Wait for animation
        
        await takeScreenshot('step5_sidebar_hidden_final.png');
        
        // Step 6: Check if floating toggle is visible
        console.log('\n🔍 Step 6: Verifying floating toggle visibility');
        const toggleCheck = await Runtime.evaluate({
            expression: `
                (function() {
                    const floatingToggle = document.getElementById('floating-toggle');
                    if (floatingToggle) {
                        const styles = window.getComputedStyle(floatingToggle);
                        const hasVisibleClass = floatingToggle.classList.contains('visible');
                        return {
                            exists: true,
                            hasVisibleClass: hasVisibleClass,
                            opacity: styles.opacity,
                            display: styles.display,
                            pointerEvents: styles.pointerEvents,
                            left: styles.left,
                            background: styles.background
                        };
                    } else {
                        return { exists: false };
                    }
                })()
            `
        });
        
        console.log('Floating toggle state:', JSON.stringify(toggleCheck.result.value, null, 2));
        
        await client.close();
        
        console.log('\n✅ All screenshots taken! Check the following files:');
        console.log('- step1_initial_state.png');
        console.log('- step2_sidebar_expanded.png');
        console.log('- step3_sidebar_collapsed.png');
        console.log('- step4_sidebar_expanded_again.png');
        console.log('- step5_sidebar_hidden_final.png');
        
    } catch (error) {
        console.error('❌ CDP connection failed:', error.message);
        console.log('💡 Make sure Electron app is running with DevTools enabled');
    }
}

// Run the test
injectSidebarControl().catch(console.error);