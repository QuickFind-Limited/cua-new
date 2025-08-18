// Fixed test for sidebar functionality with better IPC control and high-res screenshots
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function takeHighResScreenshot(filename) {
    // PowerShell script for high-resolution screenshot
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width,$bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.X,$bounds.Y,0,0,$bounds.Size)
$bmp.Save('${path.join(__dirname, filename)}',[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()
Write-Host "Screenshot saved: ${filename}"
`;
    
    try {
        execSync(`powershell -Command "${psScript.replace(/\n/g, '; ')}"`, { stdio: 'inherit' });
        console.log(`✅ High-res screenshot taken: ${filename}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to take screenshot: ${error.message}`);
        return false;
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSidebarWithIPC() {
    const CDP = require('chrome-remote-interface');
    
    try {
        // Connect with retry logic
        let client;
        let retries = 3;
        while (retries > 0) {
            try {
                client = await CDP({ port: 9222 });
                break;
            } catch (e) {
                console.log(`Connection attempt failed, retrying... (${retries} left)`);
                retries--;
                await sleep(1000);
            }
        }
        
        if (!client) {
            throw new Error('Could not connect to Chrome DevTools');
        }
        
        const { Runtime, Page } = client;
        await Runtime.enable();
        await Page.enable();
        
        console.log('📡 Connected to Electron app via CDP');
        
        // Helper function to execute commands and check results
        async function executeCommand(command, description) {
            console.log(`\n🔍 ${description}`);
            
            const result = await Runtime.evaluate({
                expression: command,
                awaitPromise: true,
                returnByValue: true
            });
            
            if (result.exceptionDetails) {
                console.error('❌ Error:', result.exceptionDetails.text);
                return null;
            }
            
            console.log('✅ Result:', result.result.value || 'Command executed');
            return result.result.value;
        }
        
        // Step 1: Initial state
        console.log('\n📸 Step 1: Initial state (sidebar hidden)');
        await takeHighResScreenshot('test1_initial_hidden.png');
        await sleep(1000);
        
        // Step 2: Click floating toggle to show sidebar
        console.log('\n📸 Step 2: Clicking floating toggle to show sidebar');
        await executeCommand(`
            (function() {
                const floatingToggle = document.getElementById('floating-toggle');
                if (floatingToggle) {
                    floatingToggle.click();
                    return 'Floating toggle clicked';
                }
                return 'Floating toggle not found';
            })()
        `, 'Clicking floating toggle');
        
        await sleep(2000); // Wait for animation
        await takeHighResScreenshot('test2_sidebar_shown.png');
        
        // Step 3: Collapse sidebar using header toggle
        console.log('\n📸 Step 3: Collapsing sidebar using header toggle');
        await executeCommand(`
            (function() {
                const headerToggle = document.getElementById('sidebar-toggle-btn');
                if (headerToggle) {
                    headerToggle.click();
                    return 'Header toggle clicked for collapse';
                }
                return 'Header toggle not found';
            })()
        `, 'Clicking header toggle to collapse');
        
        await sleep(2000); // Wait for animation
        await takeHighResScreenshot('test3_sidebar_collapsed.png');
        
        // Step 4: Expand sidebar again
        console.log('\n📸 Step 4: Expanding sidebar again');
        await executeCommand(`
            (function() {
                const headerToggle = document.getElementById('sidebar-toggle-btn');
                if (headerToggle) {
                    headerToggle.click();
                    return 'Header toggle clicked for expand';
                }
                return 'Header toggle not found';
            })()
        `, 'Clicking header toggle to expand');
        
        await sleep(2000); // Wait for animation
        await takeHighResScreenshot('test4_sidebar_expanded.png');
        
        // Step 5: Check chevron directions in different states
        console.log('\n📸 Step 5: Verifying chevron directions');
        const chevronState = await executeCommand(`
            (function() {
                const headerToggle = document.querySelector('#sidebar-toggle-btn svg polyline');
                const floatingToggle = document.querySelector('#floating-toggle svg polyline');
                const sidebar = document.getElementById('analysis-sidebar');
                
                return {
                    sidebarClasses: sidebar ? sidebar.className : 'not found',
                    headerChevronPoints: headerToggle ? headerToggle.getAttribute('points') : 'not found',
                    floatingToggleVisible: document.querySelector('.floating-toggle.visible') ? true : false,
                    floatingChevronPoints: floatingToggle ? floatingToggle.getAttribute('points') : 'not found'
                };
            })()
        `, 'Checking chevron states');
        
        console.log('Chevron states:', JSON.stringify(chevronState, null, 2));
        
        // Step 6: Collapse again to check chevron
        console.log('\n📸 Step 6: Collapsing to verify chevron direction');
        await executeCommand(`
            (function() {
                const headerToggle = document.getElementById('sidebar-toggle-btn');
                if (headerToggle) {
                    headerToggle.click();
                    return 'Collapsed for chevron check';
                }
                return 'Header toggle not found';
            })()
        `, 'Collapsing for chevron verification');
        
        await sleep(2000);
        await takeHighResScreenshot('test6_collapsed_chevron_check.png');
        
        // Get final chevron state
        const finalChevronState = await executeCommand(`
            (function() {
                const headerToggle = document.querySelector('#sidebar-toggle-btn svg polyline');
                const sidebar = document.getElementById('analysis-sidebar');
                const isCollapsed = sidebar && sidebar.classList.contains('collapsed');
                
                return {
                    isCollapsed: isCollapsed,
                    headerChevronPoints: headerToggle ? headerToggle.getAttribute('points') : 'not found',
                    expectedPoints: isCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6',
                    isCorrect: headerToggle && headerToggle.getAttribute('points') === (isCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6')
                };
            })()
        `, 'Final chevron state check');
        
        console.log('\n📊 Final chevron verification:', JSON.stringify(finalChevronState, null, 2));
        
        // Step 7: Hide sidebar completely
        console.log('\n📸 Step 7: Hiding sidebar completely');
        await executeCommand(`
            (function() {
                // First expand if collapsed
                const sidebar = document.getElementById('analysis-sidebar');
                if (sidebar && sidebar.classList.contains('collapsed')) {
                    const headerToggle = document.getElementById('sidebar-toggle-btn');
                    if (headerToggle) headerToggle.click();
                }
                // Then hide by removing active class
                setTimeout(() => {
                    if (sidebar) {
                        sidebar.classList.remove('active');
                        document.body.classList.remove('sidebar-open', 'sidebar-collapsed');
                        const floatingToggle = document.getElementById('floating-toggle');
                        if (floatingToggle) {
                            floatingToggle.classList.add('visible');
                        }
                    }
                }, 500);
                return 'Hiding sidebar';
            })()
        `, 'Hiding sidebar completely');
        
        await sleep(2000);
        await takeHighResScreenshot('test7_hidden_final.png');
        
        await client.close();
        
        console.log('\n✅ All tests completed! Screenshots saved:');
        console.log('- test1_initial_hidden.png');
        console.log('- test2_sidebar_shown.png');
        console.log('- test3_sidebar_collapsed.png');
        console.log('- test4_sidebar_expanded.png');
        console.log('- test6_collapsed_chevron_check.png');
        console.log('- test7_hidden_final.png');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testSidebarWithIPC().catch(console.error);