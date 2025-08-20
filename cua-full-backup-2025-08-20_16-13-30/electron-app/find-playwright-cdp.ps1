# PowerShell script to find Playwright's CDP port

Write-Host "Searching for Chromium processes with CDP enabled..."
Write-Host ""

# Get all Chrome/Chromium processes
$chromeProcesses = Get-Process | Where-Object { $_.ProcessName -match "chrome|chromium" }

foreach ($process in $chromeProcesses) {
    try {
        # Get command line arguments
        $wmi = Get-WmiObject Win32_Process -Filter "ProcessId = $($process.Id)"
        $cmdLine = $wmi.CommandLine
        
        if ($cmdLine -match "--remote-debugging-port=(\d+)") {
            $port = $matches[1]
            Write-Host "Found Chrome/Chromium with CDP on port: $port"
            Write-Host "  PID: $($process.Id)"
            Write-Host "  Command: $cmdLine"
            Write-Host ""
            
            # Try to connect to the port
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:$port/json/version" -TimeoutSec 2
                $version = $response.Content | ConvertFrom-Json
                Write-Host "  ✅ CDP is accessible!"
                Write-Host "  Browser: $($version.Browser)"
                Write-Host "  Protocol: $($version.'Protocol-Version')"
            } catch {
                Write-Host "  ❌ CDP not accessible on this port"
            }
            Write-Host ""
        }
    } catch {
        # Ignore errors for processes we can't access
    }
}

Write-Host "Checking common CDP ports directly..."
$ports = @(9222, 9223, 9224, 9225, 9333, 9335, 9876)

foreach ($port in $ports) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$port/json/version" -TimeoutSec 1 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $version = $response.Content | ConvertFrom-Json
            Write-Host "✅ Port $port is active - $($version.Browser)"
        }
    } catch {
        # Port not available
    }
}

Write-Host ""
Write-Host "To enable CDP in Playwright:"
Write-Host "1. Set environment variable: PWDEBUG=1"
Write-Host "2. Or launch with: playwright codegen --debug"
Write-Host "3. Or use custom launcher with CDP enabled"