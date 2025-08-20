$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupName = "cua-full-backup-$timestamp"
$excludeDirs = @('node_modules', 'dist', '.git', 'cua-new-backup-*', 'cua-full-backup-*', '.vscode', 'coverage', 'build')

Write-Host "Creating full backup: $backupName" -ForegroundColor Green

# Create backup directory
New-Item -ItemType Directory -Path $backupName -Force | Out-Null

# Get all items to backup
$items = Get-ChildItem -Path . -Force | Where-Object {
    $item = $_
    $shouldInclude = $true
    
    # Check if it's a backup directory
    if ($item.Name -like 'cua-*-backup-*') {
        $shouldInclude = $false
    }
    
    # Check against exclude list
    foreach ($exclude in $excludeDirs) {
        if ($item.Name -like $exclude) {
            $shouldInclude = $false
            break
        }
    }
    
    return $shouldInclude
}

# Copy items
foreach ($item in $items) {
    Write-Host "  Copying $($item.Name)..." -ForegroundColor Gray
    Copy-Item -Path $item.FullName -Destination "$backupName\$($item.Name)" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "`nBackup created successfully!" -ForegroundColor Green
Write-Host "Location: .\$backupName" -ForegroundColor Yellow

# Show backup contents
$size = (Get-ChildItem $backupName -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "`nBackup size: $([math]::Round($size, 2)) MB" -ForegroundColor Cyan
Write-Host "Contents:" -ForegroundColor Cyan
Get-ChildItem $backupName | Select-Object Name, @{Name="Type";Expression={if($_.PSIsContainer){"Directory"}else{"File"}}}, LastWriteTime | Format-Table -AutoSize