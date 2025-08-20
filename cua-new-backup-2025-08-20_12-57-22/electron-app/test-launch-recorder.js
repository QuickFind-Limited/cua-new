// Test script to launch Playwright recorder programmatically
const { ipcRenderer } = require('electron');

// This would normally be triggered by clicking the "Launch Recorder" button
// We'll simulate it by sending the IPC message directly

async function testLaunchRecorder() {
  console.log('Testing Playwright recorder launch with CDP...\n');
  
  try {
    // Import the recorder module
    const { app, BrowserWindow } = require('electron');
    const path = require('path');
    
    // Get the main window
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      console.error('No Electron windows found. Make sure the app is running.');
      return;
    }
    
    const mainWindow = windows[0];
    console.log('Found main window');
    
    // Import and use the recorder directly
    const { PlaywrightLauncherRecorder } = require('./dist/main/playwright-launcher-recorder.js');
    
    const recorder = new PlaywrightLauncherRecorder(mainWindow);
    console.log('Created recorder instance');
    
    console.log('Launching Playwright recorder...');
    const result = await recorder.launchRecorder('https://www.example.com');
    
    if (result.success) {
      console.log('✅ Recorder launched successfully!');
      console.log('Watch the console for CDP connection messages...');
      
      // Monitor for CDP messages
      setTimeout(() => {
        console.log('\nIf CDP connection succeeded, you should see:');
        console.log('  [CDP] Attempting to connect to Playwright browser...');
        console.log('  [CDP] Successfully connected to browser on port 9223');
        console.log('  [CDP] Stop button detection script injected successfully');
      }, 5000);
      
    } else {
      console.error('❌ Failed to launch recorder:', result.error);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Check if running in Electron context
if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
  testLaunchRecorder();
} else {
  console.log('This script must be run within the Electron app context.');
  console.log('You can run it from the DevTools console of the Electron app.');
}