param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"

if (-not $Arguments -or $Arguments.Count -eq 0) {
    throw "Provide at least one Artisan command segment."
}

$backendPath = Join-Path $PSScriptRoot "..\backend"
Set-Location $backendPath

$phpCommand = (& "$PSScriptRoot\resolve-php.ps1" -Quiet).Trim()
$phpVersion = (& $phpCommand -r "echo PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;").Trim()
$requiredVersion = [Version]"8.4"
$currentVersion = [Version]$phpVersion

if ($currentVersion -lt $requiredVersion) {
    throw "Local PHP $phpVersion is unsupported for this backend. Install PHP 8.4+ or run the command in Railway."
}

& $phpCommand artisan @Arguments
exit $LASTEXITCODE
