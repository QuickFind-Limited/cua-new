/**
 * Test script to verify screenshot capture when Playwright recording stops
 * 
 * Usage:
 * 1. Run: node test-screenshot-capture.js
 * 2. Click "Launch Recorder" in the app
 * 3. Record some actions in Playwright
 * 4. Click the stop button in Playwright's floating toolbar
 * 5. Check if screenshot was captured
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const CHECK_INTERVAL = 2000; // Check every 2 seconds
const MAX_WAIT_TIME = 120000; // Wait max 2 minutes

console.log('🔍 Screenshot Capture Test Script');
console.log('==================================');
console.log(`📁 Watching directory: ${RECORDINGS_DIR}`);
console.log('');
console.log('Instructions:');
console.log('1. Launch the Electron app: npm run dev');
console.log('2. Click "Launch Recorder" button');
console.log('3. Record some actions in the Playwright browser');
console.log('4. Click the STOP button in Playwright\'s floating toolbar');
console.log('5. This script will detect when recording stops and check for screenshot');
console.log('');
console.log('Waiting for recording to start...\n');

// Get initial list of files
let initialFiles = [];
let recordingFile = null;
let screenshotFound = false;
let startTime = Date.now();

try {
  initialFiles = fs.readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.spec.ts'));
} catch (error) {
  console.log('⚠️  Recordings directory doesn\'t exist yet, will be created when recording starts\n');
}

// Function to check for new recording files
function checkForNewRecording() {
  try {
    const currentFiles = fs.readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.spec.ts'));
    const newFiles = currentFiles.filter(f => !initialFiles.includes(f));
    
    if (newFiles.length > 0 && !recordingFile) {
      recordingFile = newFiles[0];
      console.log(`📝 Recording started: ${recordingFile}`);
      console.log('   Waiting for you to click STOP button in Playwright toolbar...\n');
      
      // Start monitoring this specific file
      monitorRecordingFile(path.join(RECORDINGS_DIR, recordingFile));
      return true;
    }
  } catch (error) {
    // Directory might not exist yet
  }
  return false;
}

// Function to monitor the recording file for completion
function monitorRecordingFile(filePath) {
  let lastContent = '';
  let checksWithoutChange = 0;
  
  const monitorInterval = setInterval(() => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check if recording has stopped (test is complete)
      const isComplete = checkIfRecordingComplete(content);
      
      if (content !== lastContent) {
        checksWithoutChange = 0;
        const actionCount = countActions(content);
        process.stdout.write(`\r   Actions recorded: ${actionCount} ${isComplete ? '(STOPPED)' : '(recording...)'}`);
        
        if (isComplete && !screenshotFound) {
          console.log('\n\n✅ Recording STOPPED detected!');
          console.log('   Checking for screenshot...\n');
          
          // Check for screenshot
          setTimeout(() => {
            checkForScreenshot(recordingFile);
            clearInterval(monitorInterval);
            clearInterval(checkInterval);
          }, 2000); // Wait 2 seconds for screenshot to be saved
        }
      } else {
        checksWithoutChange++;
        // If file hasn't changed for 6 seconds and looks complete, assume stopped
        if (checksWithoutChange > 3 && checkIfRecordingComplete(content) && !screenshotFound) {
          console.log('\n\n✅ Recording appears to be stopped (no changes detected)');
          console.log('   Checking for screenshot...\n');
          
          checkForScreenshot(recordingFile);
          clearInterval(monitorInterval);
          clearInterval(checkInterval);
        }
      }
      
      lastContent = content;
    } catch (error) {
      console.error('Error reading file:', error.message);
    }
  }, 1000);
}

// Function to check if recording is complete
function checkIfRecordingComplete(content) {
  // Check multiple indicators that recording has stopped
  const hasTestOpening = content.includes("test('") || content.includes('test("');
  const hasAsyncFunction = content.includes('async ({ page })') || content.includes('async ({page})');
  const hasClosingBrackets = content.trim().endsWith('});');
  
  // Check if the last few lines have the closing pattern
  const lines = content.trim().split('\n');
  const lastFewLines = lines.slice(-3).join('\n');
  const hasProperClosure = lastFewLines.includes('});');
  
  return hasTestOpening && hasAsyncFunction && (hasClosingBrackets || hasProperClosure);
}

// Function to count actions in the recording
function countActions(content) {
  const patterns = [
    /page\.goto/g,
    /page\.click/g,
    /page\.fill/g,
    /page\.type/g,
    /page\.press/g,
    /page\.selectOption/g,
    /page\.check/g,
    /page\.uncheck/g,
    /page\.getByRole/g,
    /page\.getByText/g,
    /page\.getByLabel/g,
    /page\.locator/g
  ];
  
  let count = 0;
  patterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  });
  
  return count;
}

// Function to check for screenshot
function checkForScreenshot(recordingFileName) {
  const baseName = recordingFileName.replace('.spec.ts', '');
  const expectedScreenshotPath = path.join(RECORDINGS_DIR, `${baseName}-success.png`);
  
  console.log(`🔍 Looking for screenshot: ${baseName}-success.png`);
  
  if (fs.existsSync(expectedScreenshotPath)) {
    const stats = fs.statSync(expectedScreenshotPath);
    console.log(`\n✅ SUCCESS! Screenshot captured!`);
    console.log(`   📸 File: ${expectedScreenshotPath}`);
    console.log(`   📏 Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   📅 Created: ${stats.mtime.toLocaleString()}`);
    console.log('\n🎉 Test PASSED - Screenshot was automatically captured when recording stopped!');
    screenshotFound = true;
  } else {
    console.log(`\n❌ FAILED - Screenshot not found`);
    console.log(`   Expected: ${expectedScreenshotPath}`);
    console.log('\n   Possible issues:');
    console.log('   - Screenshot capture might have failed');
    console.log('   - The browser tab might not be active');
    console.log('   - There might be an error in the capture code');
    
    // List all files in recordings directory for debugging
    console.log('\n   Files in recordings directory:');
    const files = fs.readdirSync(RECORDINGS_DIR);
    files.forEach(file => {
      console.log(`     - ${file}`);
    });
  }
  
  console.log('\n📊 Test complete!');
  process.exit(screenshotFound ? 0 : 1);
}

// Main monitoring loop
const checkInterval = setInterval(() => {
  if (!recordingFile) {
    checkForNewRecording();
  }
  
  // Timeout check
  if (Date.now() - startTime > MAX_WAIT_TIME) {
    console.log('\n⏱️  Timeout - no recording detected within 2 minutes');
    clearInterval(checkInterval);
    process.exit(1);
  }
}, CHECK_INTERVAL);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Test cancelled by user');
  process.exit(0);
});