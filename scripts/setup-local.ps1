param(
    [switch]$SkipFrontendInstall
)

$ErrorActionPreference = "Stop"

& "$PSScriptRoot\setup-backend.ps1"

if (-not $SkipFrontendInstall) {
    Set-Location "$PSScriptRoot\.."
    npm install
    Write-Host "Frontend dependencies installed."
}

Write-Host "Local setup completed."

