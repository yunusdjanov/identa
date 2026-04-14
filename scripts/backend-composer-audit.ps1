$ErrorActionPreference = "Stop"

$backendPath = Join-Path $PSScriptRoot "..\backend"
Set-Location $backendPath

$composerCommand = (& "$PSScriptRoot\resolve-composer.ps1" -Quiet).Trim()
& $composerCommand audit --locked
exit $LASTEXITCODE
