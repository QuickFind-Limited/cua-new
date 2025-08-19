const { chromium } = require('playwright');

console.log('🔍 CDP Screenshot Capture Test');
console.log('================================');
console.log('This script will test CDP connection and stop button detection');
console.log('\nInstructions:');
console.log('1. Launch the Electron app if not already running');
console.log('2. Click "Launch Recorder" in the app');
console.log('3. Record some actions in Playwright');
console.log('4. Click the STOP button in Playwright toolbar');
console.log('5. Check if screenshot was captured\n');

// Monitor for CDP connection
async function testCDPConnection() {
  console.log('Waiting for Playwright to launch with CDP...\n');
  
  // Wait a bit for user to launch recorder
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Try to connect to common CDP ports
  const ports = [9223, 9222, 9224, 9225];
  let connected = false;
  
  for (const port of ports) {
    try {
      console.log(`Trying to connect to port ${port}...`);
      const response = await fetch(`http://localhost:${port}/json/version`);
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ CDP found on port ${port}!`);
        console.log(`Browser: ${data.Browser}`);
        console.log(`Protocol Version: ${data['Protocol-Version']}`);
        console.log(`WebSocket URL: ${data.webSocketDebuggerUrl}\n`);
        
        // Try to connect via Playwright
        try {
          const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
          console.log('✅ Successfully connected to browser via Playwright CDP!');
          
          const contexts = browser.contexts();
          console.log(`Found ${contexts.length} browser context(s)`);
          
          if (contexts.length > 0) {
            const pages = contexts[0].pages();
            console.log(`Found ${pages.length} page(s)`);
            
            for (const page of pages) {
              console.log(`  - Page URL: ${page.url()}`);
            }
          }
          
          // Keep connection open to monitor
          console.log('\n📸 Monitoring for screenshot capture...');
          console.log('Now click the STOP button in Playwright toolbar');
          
          // Check for screenshot file periodically
          const checkForScreenshot = setInterval(() => {
            const fs = require('fs');
            const path = require('path');
            const recordingsDir = path.join(process.cwd(), 'recordings');
            
            if (fs.existsSync(recordingsDir)) {
              const files = fs.readdirSync(recordingsDir);
              const screenshots = files.filter(f => f.endsWith('-success.png'));
              
              if (screenshots.length > 0) {
                const latest = screenshots.sort().pop();
                const stats = fs.statSync(path.join(recordingsDir, latest));
                
                // Check if file was created recently (within last 10 seconds)
                const age = Date.now() - stats.mtimeMs;
                if (age < 10000) {
                  console.log(`\n✅ SCREENSHOT CAPTURED: ${latest}`);
                  console.log(`   Size: ${stats.size} bytes`);
                  console.log(`   Created: ${new Date(stats.mtimeMs).toLocaleTimeString()}`);
                  clearInterval(checkForScreenshot);
                  process.exit(0);
                }
              }
            }
          }, 1000);
          
          // Timeout after 60 seconds
          setTimeout(() => {
            console.log('\n❌ Timeout - No screenshot detected');
            clearInterval(checkForScreenshot);
            process.exit(1);
          }, 60000);
          
        } catch (err) {
          console.log(`❌ Failed to connect via Playwright: ${err.message}`);
        }
        
        connected = true;
        break;
      }
    } catch (err) {
      console.log(`   Port ${port}: Not accessible`);
    }
  }
  
  if (!connected) {
    console.log('\n❌ No CDP endpoint found. Make sure Playwright is running with --remote-debugging-port');
    console.log('The app should launch Playwright with: --browser-arg=--remote-debugging-port=9223');
  }
}

testCDPConnection().catch(console.error);