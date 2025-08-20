$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupName = 'cua-new-backup-' + $timestamp
$backupPath = Join-Path (Get-Location) $backupName

Write-Host 'Creating comprehensive backup: ' $backupName -ForegroundColor Green
Write-Host '================================================' -ForegroundColor Green

# Create backup directory
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backupPath 'electron-app') | Out-Null

# Copy root level files (excluding previous backups)
Write-Host 'Copying source code and configuration files...' -ForegroundColor Yellow
Get-ChildItem -Path '*.json', '*.md', '*.ts', '*.js', '.gitignore', '.env*' | 
    Where-Object { $_.Name -notlike 'cua-new-backup-*' } |
    Copy-Item -Destination $backupPath -ErrorAction SilentlyContinue

# Copy electron-app with proper exclusions
$excludeItems = @('node_modules', 'dist', 'playwright-profile', 'browser-profile', 'backups', 'nul')
$excludePatterns = @('*.spec.ts', '*.png', 'cua-new-backup-*', '*.zip', '*.tar.gz')

# Create electron-app structure first
robocopy 'electron-app' (Join-Path $backupPath 'electron-app') /E /XD node_modules dist playwright-profile browser-profile backups /XF nul *.spec.ts *.png /NFL /NDL /NJH /NJS

# Create package-lock snapshot for exact dependency versions
Write-Host 'Saving dependency information...' -ForegroundColor Yellow
if (Test-Path 'electron-app/package-lock.json') {
    Copy-Item -Path 'electron-app/package-lock.json' -Destination (Join-Path $backupPath 'electron-app')
}

# Create restore instructions
Write-Host 'Creating restore instructions...' -ForegroundColor Yellow
@"
CUA-NEW APPLICATION RESTORE INSTRUCTIONS
========================================
Backup created: $timestamp
Platform: Windows

PREREQUISITES:
-------------
1. Node.js v20.18.0 or higher
2. npm v10.x or higher  
3. Git (optional, for version control)
4. Visual Studio Code (recommended IDE)

RESTORE STEPS:
-------------
1. Extract this backup to your desired location
2. Open terminal/command prompt in the extracted folder
3. Run the following commands:

   # Navigate to electron app directory
   cd electron-app
   
   # Install dependencies
   npm install
   
   # Install Playwright browsers (required for recorder)
   npx playwright install chromium
   
   # Build the TypeScript files
   npm run build
   
   # Start the application in development mode
   npm run dev
   
   # Or build for production
   npm run package

ENVIRONMENT SETUP:
-----------------
1. Copy .env.example to .env (if not present)
2. Add your ANTHROPIC_API_KEY to the .env file:
   ANTHROPIC_API_KEY=your_api_key_here

FEATURES INCLUDED:
-----------------
- Playwright recorder integration
- Enhanced Flow Executor with AI capabilities
- Pre-Flight Analysis and Smart Skip Logic
- Dual-model implementation (Opus 4.1 for analysis, Sonnet 4 for runtime)
- WebView with CDP connection on port 9335
- Persistent browser profiles to avoid Chrome popups
- Modern sidebar UI with collapsible sections
- Password toggle functionality with consistent SVG icons
- Properly aligned chevron arrows for collapsible sections

TROUBLESHOOTING:
---------------
- If npm install fails, delete package-lock.json and try again
- If Playwright recorder doesn't launch, ensure Playwright is installed:
  npm install -D @playwright/test
- For CDP connection issues, ensure port 9335 is not in use
- On Windows, you may need to run as Administrator for first launch

NOTES:
-----
- This backup includes all source code and configurations
- Node_modules are excluded and will be rebuilt on restore
- Browser profiles and recordings are excluded for privacy
- All UI improvements and fixes up to the backup date are included

For support, refer to the documentation in the docs/ folder
or check the README.md file for detailed information.
"@ | Out-File -FilePath (Join-Path $backupPath 'RESTORE_INSTRUCTIONS.txt') -Encoding UTF8

# Create dependency list
Write-Host 'Creating dependency manifest...' -ForegroundColor Yellow
Set-Location electron-app
npm list --depth=0 --json | Out-File -FilePath (Join-Path $backupPath 'electron-app' 'dependencies.json') -Encoding UTF8
Set-Location ..

# Create backup of critical configuration files
Write-Host 'Backing up configuration files...' -ForegroundColor Yellow
$configBackup = Join-Path $backupPath 'config-backup'
New-Item -ItemType Directory -Force -Path $configBackup | Out-Null

# Copy VS Code settings if they exist
if (Test-Path '.vscode') {
    Copy-Item -Path '.vscode' -Destination $configBackup -Recurse -Force
}

# Create file inventory
Write-Host 'Creating file inventory...' -ForegroundColor Yellow
Get-ChildItem -Path $backupPath -Recurse -File | 
    Select-Object FullName, Length, LastWriteTime | 
    Export-Csv -Path (Join-Path $backupPath 'file_inventory.csv') -NoTypeInformation

# Calculate backup size
$backupSize = (Get-ChildItem -Path $backupPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$fileCount = (Get-ChildItem -Path $backupPath -Recurse -File).Count

# Create backup summary
@"
BACKUP SUMMARY
==============
Backup Name: $backupName
Created: $timestamp
Total Files: $fileCount
Total Size: $([math]::Round($backupSize, 2)) MB
Platform: Windows
Node Version Required: v20.18.0+
Electron Version: 31.7.7

This backup contains everything needed to restore the CUA-NEW application
on a new machine. Follow RESTORE_INSTRUCTIONS.txt for detailed steps.
"@ | Out-File -FilePath (Join-Path $backupPath 'BACKUP_SUMMARY.txt') -Encoding UTF8

# Create ZIP archive
Write-Host 'Creating ZIP archive...' -ForegroundColor Yellow
$zipFile = $backupName + '.zip'
Compress-Archive -Path $backupPath -DestinationPath $zipFile -CompressionLevel Optimal -Force

# Verify ZIP creation
if (Test-Path $zipFile) {
    $zipSize = [math]::Round((Get-Item $zipFile).Length / 1MB, 2)
    Write-Host '================================================' -ForegroundColor Green
    Write-Host 'Backup completed successfully!' -ForegroundColor Green
    Write-Host "Backup archive: $zipFile" -ForegroundColor Cyan
    Write-Host "Archive size: $zipSize MB" -ForegroundColor Cyan
    Write-Host "Files backed up: $fileCount" -ForegroundColor Cyan
    Write-Host '================================================' -ForegroundColor Green
    
    # Clean up uncompressed backup folder
    Remove-Item -Path $backupPath -Recurse -Force
    
    Write-Host 'To restore on another machine:' -ForegroundColor Yellow
    Write-Host "1. Copy $zipFile to the target machine" -ForegroundColor White
    Write-Host '2. Extract the ZIP file' -ForegroundColor White
    Write-Host '3. Follow instructions in RESTORE_INSTRUCTIONS.txt' -ForegroundColor White
} else {
    Write-Host 'ERROR: Failed to create backup archive!' -ForegroundColor Red
}