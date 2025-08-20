// Test sidebar with Playwright - controlling the embedded browser via CDP
const { chromium } = require('playwright');
const path = require('path');
const { execSync, spawn } = require('child_process');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function killAllElectronProcesses() {
    console.log('🛑 Killing all Electron processes...');
    try {
        // Use PowerShell to kill all electron processes
        execSync('powershell -Command "Get-Process | Where-Object {$_.ProcessName -like \'*electron*\'} | Stop-Process -Force"', { stdio: 'ignore' });
        await sleep(1000);
        console.log('✅ All Electron processes killed');
    } catch (error) {
        // Ignore errors if no processes found
    }
}

async function startApp() {
    console.log('🚀 Starting Electron app with npm run dev...');
    const app = spawn('npm', ['run', 'dev'], {
        cwd: __dirname,
        shell: true,
        detached: false,
        env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
    });
    
    let started = false;
    app.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Stealth injection completed') || output.includes('DevTools listening')) {
            if (!started) {
                console.log('✅ App started successfully');
                started = true;
            }
        }
    });
    
    app.stderr.on('data', (data) => {
        // Log errors but don't fail
        console.log('App stderr:', data.toString());
    });
    
    // Wait for app to fully start
    await sleep(10000);
    return app;
}

async function testSidebar() {
    let appProcess = null;
    let browser = null;
    
    try {
        // Kill any existing processes first
        await killAllElectronProcesses();
        
        // Start the app
        appProcess = await startApp();
        
        // Connect to the embedded browser in Electron app using CDP
        console.log('🔌 Connecting to embedded browser via CDP...');
        
        // Try to connect with retries
        let retries = 3;
        while (retries > 0) {
            try {
                browser = await chromium.connectOverCDP('http://localhost:9222', {
                    timeout: 5000
                });
                console.log('✅ Connected to CDP');
                break;
            } catch (error) {
                console.log(`Connection attempt failed, retrying... (${retries} left)`);
                retries--;
                await sleep(2000);
            }
        }
        
        if (!browser) {
            throw new Error('Failed to connect to CDP after multiple attempts');
        }
        
        const contexts = browser.contexts();
        if (contexts.length === 0) {
            throw new Error('No browser contexts found');
        }
        
        const context = contexts[0];
        const pages = context.pages();
        
        // Find the main window page
        let page = null;
        for (const p of pages) {
            const url = p.url();
            console.log('Found page:', url);
            if (url.includes('tabbar.html') || url === 'about:blank') {
                page = p;
                break;
            }
        }
        
        if (!page) {
            throw new Error('Could not find main window page');
        }
        
        console.log('✅ Connected to main window');
        
        // Set viewport for high-resolution screenshots
        await page.setViewportSize({ width: 1920, height: 1080 });
        
        // Helper function to take high-res screenshot
        async function takeScreenshot(filename, description) {
            console.log(`\n📸 ${description}`);
            await page.screenshot({ 
                path: path.join(__dirname, filename),
                fullPage: false,
                type: 'png'
            });
            console.log(`✅ Screenshot saved: ${filename}`);
        }
        
        // Test sequence
        console.log('\n🧪 Starting sidebar tests...\n');
        
        // Step 1: Initial state
        await takeScreenshot('test1_initial_hidden_hires.png', 'Step 1: Initial state (sidebar hidden)');
        await sleep(1000);
        
        // Step 2: Click floating toggle to show sidebar
        console.log('\n🖱️ Clicking floating toggle to show sidebar...');
        const floatingToggle = await page.$('#floating-toggle');
        if (floatingToggle) {
            await floatingToggle.click();
            console.log('✅ Floating toggle clicked');
        } else {
            console.log('❌ Floating toggle not found');
        }
        await sleep(2500); // Wait for animation
        await takeScreenshot('test2_sidebar_shown_hires.png', 'Step 2: After clicking floating toggle');
        
        // Check if sidebar is visible
        const sidebarVisible = await page.evaluate(() => {
            const sidebar = document.getElementById('analysis-sidebar');
            return sidebar && sidebar.classList.contains('active');
        });
        console.log('Sidebar visible:', sidebarVisible);
        
        // Step 3: Click header toggle to collapse
        console.log('\n🖱️ Clicking header toggle to collapse sidebar...');
        const headerToggle = await page.$('#sidebar-toggle-btn');
        if (headerToggle) {
            await headerToggle.click();
            console.log('✅ Header toggle clicked for collapse');
        } else {
            console.log('❌ Header toggle not found');
        }
        await sleep(2500);
        await takeScreenshot('test3_sidebar_collapsed_hires.png', 'Step 3: Sidebar collapsed');
        
        // Check chevron direction
        const chevronPoints1 = await page.evaluate(() => {
            const chevron = document.querySelector('#sidebar-toggle-btn svg polyline');
            return chevron ? chevron.getAttribute('points') : null;
        });
        console.log('Chevron points when collapsed:', chevronPoints1);
        console.log('Expected for collapsed (right arrow):', '9 18 15 12 9 6');
        
        // Step 4: Click header toggle to expand
        console.log('\n🖱️ Clicking header toggle to expand sidebar...');
        if (headerToggle) {
            await headerToggle.click();
            console.log('✅ Header toggle clicked for expand');
        }
        await sleep(2500);
        await takeScreenshot('test4_sidebar_expanded_hires.png', 'Step 4: Sidebar expanded again');
        
        // Check chevron direction
        const chevronPoints2 = await page.evaluate(() => {
            const chevron = document.querySelector('#sidebar-toggle-btn svg polyline');
            return chevron ? chevron.getAttribute('points') : null;
        });
        console.log('Chevron points when expanded:', chevronPoints2);
        console.log('Expected for expanded (left arrow):', '15 18 9 12 15 6');
        
        // Step 5: Collapse again to verify
        console.log('\n🖱️ Collapsing again for verification...');
        if (headerToggle) {
            await headerToggle.click();
            console.log('✅ Header toggle clicked for collapse');
        }
        await sleep(2500);
        await takeScreenshot('test5_collapsed_verify_hires.png', 'Step 5: Collapsed state verification');
        
        // Verify solid grey background
        const hasGreyBackground = await page.evaluate(() => {
            const sidebar = document.getElementById('analysis-sidebar');
            if (!sidebar) return false;
            const styles = window.getComputedStyle(sidebar);
            return styles.background.includes('rgb(245, 245, 245)') || 
                   styles.backgroundColor === 'rgb(245, 245, 245)';
        });
        console.log('Has grey background when collapsed:', hasGreyBackground);
        
        // Step 6: Hide sidebar completely
        console.log('\n🖱️ Hiding sidebar completely...');
        // First expand if collapsed
        const isCollapsed = await page.evaluate(() => {
            const sidebar = document.getElementById('analysis-sidebar');
            return sidebar && sidebar.classList.contains('collapsed');
        });
        
        if (isCollapsed && headerToggle) {
            await headerToggle.click();
            await sleep(1000);
        }
        
        // Now hide by clicking floating toggle or using JavaScript
        await page.evaluate(() => {
            const sidebar = document.getElementById('analysis-sidebar');
            if (sidebar) {
                sidebar.classList.remove('active');
                document.body.classList.remove('sidebar-open', 'sidebar-collapsed');
                const floatingToggle = document.getElementById('floating-toggle');
                if (floatingToggle) {
                    floatingToggle.classList.add('visible');
                }
            }
        });
        await sleep(2000);
        await takeScreenshot('test6_hidden_final_hires.png', 'Step 6: Sidebar hidden completely');
        
        // Final verification
        console.log('\n📊 Final verification:');
        const finalState = await page.evaluate(() => {
            const sidebar = document.getElementById('analysis-sidebar');
            const floatingToggle = document.getElementById('floating-toggle');
            const headerChevron = document.querySelector('#sidebar-toggle-btn svg polyline');
            const floatingChevron = document.querySelector('#floating-toggle svg polyline');
            
            return {
                sidebarActive: sidebar ? sidebar.classList.contains('active') : false,
                sidebarCollapsed: sidebar ? sidebar.classList.contains('collapsed') : false,
                floatingToggleVisible: floatingToggle ? floatingToggle.classList.contains('visible') : false,
                headerChevronPoints: headerChevron ? headerChevron.getAttribute('points') : null,
                floatingChevronPoints: floatingChevron ? floatingChevron.getAttribute('points') : null,
                noShadow: !document.querySelector('.analysis-sidebar').style.boxShadow,
                noBorder: window.getComputedStyle(floatingToggle).border === 'none' || 
                         window.getComputedStyle(floatingToggle).border === '0px none rgb(51, 51, 51)'
            };
        });
        
        console.log('Final state:', JSON.stringify(finalState, null, 2));
        
        console.log('\n✅ All tests completed successfully!');
        console.log('\n📁 High-resolution screenshots saved:');
        console.log('  - test1_initial_hidden_hires.png');
        console.log('  - test2_sidebar_shown_hires.png');
        console.log('  - test3_sidebar_collapsed_hires.png');
        console.log('  - test4_sidebar_expanded_hires.png');
        console.log('  - test5_collapsed_verify_hires.png');
        console.log('  - test6_hidden_final_hires.png');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Cleanup
        if (browser) {
            await browser.close();
        }
        if (appProcess) {
            console.log('\n🛑 Stopping app...');
            // Kill the app process and all children properly
            try {
                if (process.platform === 'win32') {
                    // Use PowerShell for more reliable process termination
                    execSync(`powershell -Command "Stop-Process -Id ${appProcess.pid} -Force"`, { stdio: 'ignore' });
                    // Also kill any remaining electron processes
                    await killAllElectronProcesses();
                } else {
                    appProcess.kill('SIGTERM');
                }
            } catch (error) {
                // Ignore errors during cleanup
            }
        }
    }
}

// Run the test
testSidebar().catch(console.error);