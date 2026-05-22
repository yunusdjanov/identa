param(
    [int]$Port = 8001,
    [string]$BindHost = "0.0.0.0",
    [switch]$SkipServe
)

$ErrorActionPreference = "Stop"

function Get-ListeningProcessIdsForPort {
    param([int]$TargetPort)

    return netstat -ano |
        Select-String "LISTENING" |
        ForEach-Object {
            $parts = (($_.ToString() -split '\s+') | Where-Object { $_ -ne '' })
            if ($parts.Length -ge 5 -and $parts[1] -like "*:$TargetPort") {
                return [int]$parts[-1]
            }
        } |
        Where-Object { $_ -gt 0 } |
        Sort-Object -Unique
}

function Stop-ProcessOnPort {
    param([int]$TargetPort)

    $processIds = Get-ListeningProcessIdsForPort -TargetPort $TargetPort
    foreach ($processId in $processIds) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch {
            # Best-effort cleanup; let bind fail loudly if a process remains.
        }
    }
}

$phpCommand = (& "$PSScriptRoot\resolve-php.ps1").Trim()
$backendPath = (Resolve-Path "$PSScriptRoot\..\backend").Path
$localDatabasePath = Join-Path $backendPath "database\local.sqlite"
$databaseUrlVariables = @(
    "DB_URL",
    "DATABASE_URL",
    "DATABASE_PRIVATE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRIVATE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "MYSQL_URL",
    "MYSQL_PRIVATE_URL"
)
$hasDatabaseUrl = $false
foreach ($variableName in $databaseUrlVariables) {
    if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($variableName))) {
        $hasDatabaseUrl = $true
        break
    }
}
$hasExplicitNonSqliteConnection = -not [string]::IsNullOrWhiteSpace($env:DB_CONNECTION) -and $env:DB_CONNECTION -ne "sqlite"
$shouldUseManagedSqlite = -not $hasDatabaseUrl `
    -and -not $hasExplicitNonSqliteConnection `
    -and ([string]::IsNullOrWhiteSpace($env:DB_DATABASE) -or $env:DB_DATABASE -eq ":memory:")

if ($shouldUseManagedSqlite) {
    $localDatabaseNeedsSeed = -not (Test-Path -LiteralPath $localDatabasePath) `
        -or ((Get-Item -LiteralPath $localDatabasePath -ErrorAction SilentlyContinue).Length -eq 0)
    New-Item -ItemType File -Path $localDatabasePath -Force | Out-Null
    $env:DB_CONNECTION = "sqlite"
    $env:DB_DATABASE = $localDatabasePath
}
else {
    $localDatabaseNeedsSeed = $false
}

Stop-ProcessOnPort -TargetPort $Port

$env:APP_URL = "http://127.0.0.1:$Port"
$env:FRONTEND_URL = "http://127.0.0.1:3000"
$defaultFrontendUrls = @("http://localhost:3000", "http://127.0.0.1:3000")
$configuredFrontendUrls = @()
if (-not [string]::IsNullOrWhiteSpace($env:FRONTEND_URLS)) {
    $configuredFrontendUrls = $env:FRONTEND_URLS -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
}
$env:FRONTEND_URLS = (($defaultFrontendUrls + $configuredFrontendUrls) | Select-Object -Unique) -join ","
$env:SANCTUM_STATEFUL_DOMAINS = "localhost,localhost:3000,localhost:$Port,127.0.0.1,127.0.0.1:3000,127.0.0.1:$Port"
$env:SESSION_DRIVER = "file"
$env:SESSION_SECURE_COOKIE = "false"
$env:SESSION_SAME_SITE = "lax"

& "$PSScriptRoot\sync-backend-db.ps1"

if ($localDatabaseNeedsSeed) {
    Set-Location $backendPath
    Write-Host "Seeding local demo data..."
    & $phpCommand artisan db:seed --force --no-interaction
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Local demo seed failed. Fix seeder errors before starting backend."
        exit $LASTEXITCODE
    }
}

if ($SkipServe) {
    Write-Host "Backend preflight completed. Server start skipped."
    exit 0
}

Set-Location "$PSScriptRoot\..\backend\public"
& $phpCommand -S "${BindHost}:${Port}" ".\dev-router.php"
