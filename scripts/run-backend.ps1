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

Stop-ProcessOnPort -TargetPort $Port

$env:APP_URL = "http://127.0.0.1:$Port"
$env:FRONTEND_URL = "http://127.0.0.1:3000"
$env:FRONTEND_URLS = "http://localhost:3000,http://127.0.0.1:3000"
$env:SANCTUM_STATEFUL_DOMAINS = "localhost,localhost:3000,localhost:$Port,127.0.0.1,127.0.0.1:3000,127.0.0.1:$Port"
$env:SESSION_DRIVER = "file"
$env:SESSION_SECURE_COOKIE = "false"
$env:SESSION_SAME_SITE = "lax"

& "$PSScriptRoot\sync-backend-db.ps1"

if ($SkipServe) {
    Write-Host "Backend preflight completed. Server start skipped."
    exit 0
}

Set-Location "$PSScriptRoot\..\backend\public"
& $phpCommand -S "${BindHost}:${Port}" ".\dev-router.php"
