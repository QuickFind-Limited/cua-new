# PowerShell script to trigger recorder launch via DevTools
# This simulates clicking the "Launch Recorder" button

$script = @'
// Trigger recorder launch
const launchBtn = document.getElementById('launcher-btn');
if (launchBtn) {
    console.log('Found launcher button, clicking...');
    launchBtn.click();
} else {
    console.log('Launcher button not found');
    
    // Try alternative method - direct IPC call
    if (window.electronAPI && window.electronAPI.launchRecorder) {
        console.log('Using direct IPC call to launch recorder...');
        window.electronAPI.launchRecorder('https://www.example.com').then(result => {
            console.log('Recorder launch result:', result);
        });
    }
}
'@

Write-Host "Triggering Playwright recorder launch..."
Write-Host "Make sure the Electron app is running first!"
Write-Host ""
Write-Host "Open DevTools in the Electron app (Ctrl+Shift+I) and run this in the console:"
Write-Host ""
Write-Host $script
Write-Host ""
Write-Host "Then watch the main console for CDP connection messages."