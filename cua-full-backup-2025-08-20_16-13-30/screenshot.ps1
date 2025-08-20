Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object Drawing.Bitmap $bounds.width, $bounds.height
$graphics = [Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.size)
$bmp.Save("C:\client\cua-new\test_screenshot_startup.png")
$graphics.Dispose()
$bmp.Dispose()
Write-Host "Screenshot saved to C:\client\cua-new\test_screenshot_startup.png"