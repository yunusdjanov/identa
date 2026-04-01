$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\backend"

$phpCommand = (& "$PSScriptRoot\resolve-php.ps1" -Quiet).Trim()

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}

composer install
& $phpCommand artisan key:generate --force
& $phpCommand artisan migrate --force
& $phpCommand artisan optimize:clear

Write-Host "Backend setup completed."
