$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$wrongPage = Join-Path $projectRoot 'app\dashboard\settings\page.tsx'

if (Test-Path -LiteralPath $wrongPage) {
  Remove-Item -LiteralPath $wrongPage -Force
  Write-Host 'Removed accidental duplicate: app/dashboard/settings/page.tsx' -ForegroundColor Green
} else {
  Write-Host 'No accidental app/dashboard/settings/page.tsx file found.' -ForegroundColor Yellow
}

# Remove only empty directories. Never delete any other user/project files.
$maybeEmpty = @(
  (Join-Path $projectRoot 'app\dashboard\settings'),
  (Join-Path $projectRoot 'app\dashboard')
)

foreach ($dir in $maybeEmpty) {
  if (Test-Path -LiteralPath $dir) {
    $children = @(Get-ChildItem -LiteralPath $dir -Force)
    if ($children.Count -eq 0) {
      Remove-Item -LiteralPath $dir -Force
      Write-Host "Removed empty directory: $dir" -ForegroundColor DarkGray
    }
  }
}

$correctPage = Join-Path $projectRoot 'app\(dashboard)\dashboard\settings\page.tsx'
if (-not (Test-Path -LiteralPath $correctPage)) {
  throw 'Correct Settings page was not found at app/(dashboard)/dashboard/settings/page.tsx. Re-extract this patch into the project root first.'
}

Write-Host ''
Write-Host 'TENH POS dashboard route conflict cleanup complete.' -ForegroundColor Cyan
Write-Host 'Now run: npm run build' -ForegroundColor Cyan
