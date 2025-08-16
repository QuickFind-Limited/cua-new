Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$bounds = [Drawing.Rectangle]::FromLTRB(0, 0, 1920, 1080)
$bmp = New-Object Drawing.Bitmap $bounds.width, $bounds.height
$graphics = [Drawing.Graphics]::FromImage($bmp)

$graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.size)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$filename = "C:\client\cua-new\electron-app\screenshots\screenshot_$timestamp.png"

$bmp.Save($filename)
$bmp.Dispose()
$graphics.Dispose()

Write-Host "Screenshot saved to: $filename"