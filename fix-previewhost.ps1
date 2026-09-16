$ErrorActionPreference = "Stop"
$path = Join-Path (Get-Location) "app/get-started/get-started-form.tsx"
if (-not (Test-Path $path)) {
  throw "Cannot find $path. Run this script from the TENH POS project root."
}

$content = Get-Content -Raw -Path $path
$before = '.{previewHost}'
$after = '.tenh-pos.com'

if ($content.Contains($before)) {
  $content = $content.Replace($before, $after)
  Set-Content -Path $path -Value $content -NoNewline -Encoding utf8
  Write-Host "Fixed: replaced .{previewHost} with .tenh-pos.com" -ForegroundColor Green
} elseif ($content.Contains($after)) {
  Write-Host "Already fixed: .tenh-pos.com is already present." -ForegroundColor Yellow
} else {
  throw "Expected text .{previewHost} was not found. Open the file and replace only that expression with .tenh-pos.com manually."
}

Write-Host "Now run: npm run build"
