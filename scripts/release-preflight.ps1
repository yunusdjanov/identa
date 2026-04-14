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

if ($Production) {
    Invoke-Step -Name "Secrets Preflight (Production)" -Action {
        npx @railway/cli ssh -s identa -e production php artisan security:check-secrets
    }

    Invoke-Step -Name "Runtime Security Policy (Production)" -Action {
        npx @railway/cli ssh -s identa -e production php artisan security:check-runtime --production
    }
} else {
    Invoke-Step -Name "Secrets Preflight" -Action {
        npm run check:secrets
    }

    Invoke-Step -Name "Runtime Security Policy (Current Environment)" -Action {
        npm run check:runtime-security
    }
}

Write-Host ""
Write-Host "Release preflight passed."
