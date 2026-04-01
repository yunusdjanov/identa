param(
    [switch]$Production
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Name"
    }
}

Invoke-Step -Name "Dependency Security Audit" -Action {
    npm run quality:security
}

Invoke-Step -Name "Secrets Preflight" -Action {
    npm run check:secrets
}

if ($Production) {
    Invoke-Step -Name "Runtime Security Policy (Production)" -Action {
        Set-Location "$PSScriptRoot\..\backend"
        php artisan security:check-runtime --production
        Set-Location "$PSScriptRoot\.."
    }
} else {
    Invoke-Step -Name "Runtime Security Policy (Current Environment)" -Action {
        npm run check:runtime-security
    }
}

Write-Host ""
Write-Host "Release preflight passed."
