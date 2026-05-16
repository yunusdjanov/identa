$ErrorActionPreference = "Stop"

$backendPath = Join-Path $PSScriptRoot "..\backend"
Set-Location $backendPath

$composerCommand = (& "$PSScriptRoot\resolve-composer.ps1" -Quiet).Trim()
$phpCommand = (& "$PSScriptRoot\resolve-php.ps1" -Quiet).Trim()

if ($composerCommand.EndsWith(".phar")) {
    & $phpCommand $composerCommand audit --locked
}
else {
    & $composerCommand audit --locked
}
exit $LASTEXITCODE
