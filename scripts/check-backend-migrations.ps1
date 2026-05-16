$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\backend"

$phpCommand = (& "$PSScriptRoot\resolve-php.ps1" -Quiet).Trim()
$envPath = Join-Path (Get-Location) ".env"
$temporaryDatabasePath = $null

if (Test-Path -LiteralPath $envPath) {
    $envLines = Get-Content -LiteralPath $envPath
    $dbConnection = ($envLines | Where-Object { $_ -match '^DB_CONNECTION=' } | Select-Object -First 1) -replace '^DB_CONNECTION=', ''
    $dbDatabase = ($envLines | Where-Object { $_ -match '^DB_DATABASE=' } | Select-Object -First 1) -replace '^DB_DATABASE=', ''

    if ($dbConnection -eq "sqlite" -and $dbDatabase -eq ":memory:") {
        $temporaryDatabasePath = Join-Path (Resolve-Path ".\database").Path "migration-check.sqlite"
        if (Test-Path -LiteralPath $temporaryDatabasePath) {
            Remove-Item -LiteralPath $temporaryDatabasePath -Force
        }
        New-Item -ItemType File -Path $temporaryDatabasePath -Force | Out-Null
        $env:DB_CONNECTION = "sqlite"
        $env:DB_DATABASE = $temporaryDatabasePath
        & $phpCommand artisan migrate --force --no-ansi | Out-Null
    }
}

$statusOutput = & $phpCommand artisan migrate:status --no-ansi 2>&1
$statusExitCode = $LASTEXITCODE

if ($temporaryDatabasePath -ne $null -and (Test-Path -LiteralPath $temporaryDatabasePath)) {
    Remove-Item -LiteralPath $temporaryDatabasePath -Force
}

if ($statusExitCode -ne 0) {
    Write-Error "Failed to read migration status.`n$statusOutput"
    exit $statusExitCode
}

$pendingRows = $statusOutput | Select-String -Pattern '\|\s*Pending\s*\|'
if ($pendingRows) {
    Write-Error "Pending migrations detected. Run 'npm run db:migrate' before continuing."
    exit 1
}

Write-Host "Migration status check passed. No pending migrations."
