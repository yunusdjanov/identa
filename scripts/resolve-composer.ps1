param(
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Resolve-ComposerCandidate {
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

$preferredCandidates = @(
    "C:\ProgramData\ComposerSetup\bin\composer.bat",
    "C:\ProgramData\ComposerSetup\bin\composer"
)

$resolvedComposer = $null

foreach ($candidate in $preferredCandidates) {
    $resolvedComposer = Resolve-ComposerCandidate -CandidatePath $candidate
    if ($resolvedComposer) {
        break
    }
}

if (-not $resolvedComposer) {
    $composerCommand = Get-Command composer -ErrorAction SilentlyContinue
    if ($composerCommand) {
        $resolvedComposer = Resolve-ComposerCandidate -CandidatePath $composerCommand.Source
    }
}

if (-not $resolvedComposer) {
    throw "Unable to locate Composer. Install Composer locally or add it to PATH."
}

if (-not $Quiet) {
    Write-Host "Using Composer binary: $resolvedComposer"
}

Write-Output $resolvedComposer
