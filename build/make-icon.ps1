# Rebuilds build/icon.ico from build/icon.png (PNG-compressed ICO, supported since Windows Vista)
# Usage:  powershell -ExecutionPolicy Bypass -File build\make-icon.ps1
param(
  [string]$Source = (Join-Path $PSScriptRoot 'icon.png'),
  [string]$Out    = (Join-Path $PSScriptRoot 'icon.ico'),
  [int[]]$Sizes   = @(16, 24, 32, 48, 64, 128, 256)
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($Source)
$frames = @()
foreach ($s in $Sizes) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $s, $s)
  $g.Dispose()

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $frames += ,@{ Size = $s; Data = $ms.ToArray() }
  $ms.Dispose()
  $bmp.Dispose()
}
$src.Dispose()

$count = $frames.Count
$header = New-Object byte[] 6
$header[0] = 0; $header[1] = 0; $header[2] = 1; $header[3] = 0
$header[4] = [byte] $count; $header[5] = 0

$offset = 6 + 16 * $count
$entries = New-Object System.Collections.Generic.List[byte]
$chunks = New-Object System.Collections.Generic.List[byte]

foreach ($f in $frames) {
  $dim = if ($f.Size -ge 256) { 0 } else { $f.Size }
  $e = New-Object byte[] 16
  $e[0] = [byte] $dim; $e[1] = [byte] $dim; $e[2] = 0; $e[3] = 0
  $e[4] = 1; $e[5] = 0
  $e[6] = 32; $e[7] = 0
  [Array]::Copy([BitConverter]::GetBytes([UInt32] $f.Data.Length), 0, $e, 8, 4)
  [Array]::Copy([BitConverter]::GetBytes([UInt32] $offset), 0, $e, 12, 4)
  $entries.AddRange($e)
  $chunks.AddRange($f.Data)
  $offset += $f.Data.Length
}

$all = New-Object byte[] ($header.Length + $entries.Count + $chunks.Count)
[Array]::Copy($header, 0, $all, 0, $header.Length)
[Array]::Copy($entries.ToArray(), 0, $all, $header.Length, $entries.Count)
[Array]::Copy($chunks.ToArray(), 0, $all, $header.Length + $entries.Count, $chunks.Count)

[System.IO.File]::WriteAllBytes($Out, $all)
Write-Host "OK: $Out ($($all.Length) bytes, sizes: $($Sizes -join ', '))"
