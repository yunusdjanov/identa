param(
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Get-HerdPhpPath {
    $herdBin = Join-Path $env:USERPROFILE ".config\herd\bin"
    if (-not (Test-Path $herdBin)) {
        return $null
    }

    $candidate = Get-ChildItem $herdBin -Directory -Filter "php*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object {
            $phpExe = Join-Path $_.FullName "php.exe"
            if (Test-Path $phpExe) {
                return $phpExe
            }
        } |
        Select-Object -First 1

    return $candidate
}

$resolvedPhp = $null

$phpCommand = Get-Command php -ErrorAction SilentlyContinue
if ($phpCommand) {
    $resolvedPhp = $phpCommand.Source
}

if (-not $resolvedPhp) {
    $resolvedPhp = Get-HerdPhpPath
}

if (-not $resolvedPhp) {
    $runningPhp = Get-Process -Name php -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty Path
    if ($runningPhp) {
        $resolvedPhp = $runningPhp
    }
}

if (-not $resolvedPhp) {
    throw "Unable to locate php.exe. Install PHP locally or add it to PATH."
}

if (-not $Quiet) {
    Write-Host "Using PHP binary: $resolvedPhp"
}

Write-Output $resolvedPhp
