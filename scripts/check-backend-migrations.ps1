$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\backend"

$phpCommand = (& "$PSScriptRoot\resolve-php.ps1" -Quiet).Trim()
$statusOutput = & $phpCommand artisan migrate:status --no-ansi 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to read migration status.`n$statusOutput"
    exit $LASTEXITCODE
}

$pendingRows = $statusOutput | Select-String -Pattern '\|\s*Pending\s*\|'
if ($pendingRows) {
    Write-Error "Pending migrations detected. Run 'npm run db:migrate' before continuing."
    exit 1
}

Write-Host "Migration status check passed. No pending migrations."
