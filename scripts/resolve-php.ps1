param(
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Resolve-PhpCandidate {
    param([string]$CandidatePath)

    if ([string]::IsNullOrWhiteSpace($CandidatePath)) {
        return $null
    }

    try {
        if (-not (Test-Path -LiteralPath $CandidatePath -PathType Leaf -ErrorAction Stop)) {
            return $null
        }
    }
    catch {
        return $null
    }

    return $CandidatePath
}

function Get-HerdPhpPath {
    $herdBin = Join-Path $env:USERPROFILE ".config\herd\bin"
    $herdBinExists = $false
    try {
        $herdBinExists = Test-Path -LiteralPath $herdBin -PathType Container -ErrorAction Stop
    }
    catch {
        # Some machines deny access to this path; fallback discovery will continue.
        $herdBinExists = $false
    }

    if (-not $herdBinExists) {
        return $null
    }

    $candidate = Get-ChildItem $herdBin -Directory -Filter "php*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object {
            $phpExe = Join-Path $_.FullName "php.exe"
            if (Test-Path -LiteralPath $phpExe -PathType Leaf -ErrorAction SilentlyContinue) {
                return $phpExe
            }
        } |
        Select-Object -First 1

    return $candidate
}

$resolvedPhp = $null

$phpCommand = Get-Command php -ErrorAction SilentlyContinue
if ($phpCommand) {
    $resolvedPhp = Resolve-PhpCandidate -CandidatePath $phpCommand.Source
}

if (-not $resolvedPhp) {
    $resolvedPhp = Resolve-PhpCandidate -CandidatePath (Get-HerdPhpPath)
}

if (-not $resolvedPhp) {
    $runningPhp = Get-Process -Name php -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty Path
    if ($runningPhp) {
        $resolvedPhp = Resolve-PhpCandidate -CandidatePath $runningPhp
    }
}

if (-not $resolvedPhp) {
    throw "Unable to locate php.exe. Install PHP locally or add it to PATH."
}

if (-not $Quiet) {
    Write-Host "Using PHP binary: $resolvedPhp"
}

Write-Output $resolvedPhp
