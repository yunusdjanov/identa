$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\backend"

$phpCommand = (& "$PSScriptRoot\resolve-php.ps1" -Quiet).Trim()

if (-not (Test-Path ".env")) {
    Write-Error "Missing backend/.env. Run scripts/setup-backend.ps1 first."
    exit 1
}

Write-Host "Applying pending backend migrations..."
& $phpCommand artisan migrate --force --no-interaction

if ($LASTEXITCODE -ne 0) {
    Write-Error "Migration sync failed. Fix migration errors before starting backend."
    exit $LASTEXITCODE
}

Write-Host "Backend schema sync complete."
