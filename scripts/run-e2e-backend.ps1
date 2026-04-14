param(
    [int]$Port = 8100,
    [string]$FrontendUrl = "http://localhost:3100"
)

$ErrorActionPreference = "Stop"

function Stop-ProcessOnPort {
    param([int]$TargetPort)

    $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        try {
            Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
        }
        catch {
            # Ignore failures here and let the subsequent bind fail loudly if needed.
        }
    }
}

Stop-ProcessOnPort -TargetPort $Port

$env:FRONTEND_URL = $FrontendUrl
$frontendUri = [System.Uri]$FrontendUrl
$frontendHostPort = "$($frontendUri.Host):$($frontendUri.Port)"
$env:FRONTEND_URLS = "$FrontendUrl,http://localhost:$($frontendUri.Port),http://127.0.0.1:$($frontendUri.Port)"
$env:SANCTUM_STATEFUL_DOMAINS = "$frontendHostPort,$($frontendUri.Host),localhost:$($frontendUri.Port),localhost,127.0.0.1:$($frontendUri.Port),127.0.0.1"
$env:SESSION_DRIVER = "file"
$env:SESSION_DOMAIN = $frontendUri.Host
$env:SESSION_SECURE_COOKIE = "false"
$env:SESSION_SAME_SITE = "lax"

Set-Location "$PSScriptRoot\..\backend"

$phpCommand = (& "$PSScriptRoot\resolve-php.ps1" -Quiet).Trim()

& $phpCommand artisan key:generate --force
& $phpCommand artisan optimize:clear
& $phpCommand artisan migrate:fresh --seed --force
Set-Location ".\public"
& $phpCommand -S "localhost:$Port" "..\vendor\laravel\framework\src\Illuminate\Foundation\resources\server.php"
