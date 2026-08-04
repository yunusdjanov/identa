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
$env:APP_ENV = "testing"
$env:APP_DEBUG = "false"
$env:APP_KEY = "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
$env:APP_TIMEZONE = "Asia/Tashkent"
$env:CACHE_STORE = "array"
$env:QUEUE_CONNECTION = "sync"
$env:MAIL_MAILER = "array"
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
$databasePath = (Resolve-Path ".\database").Path
$e2eDatabasePath = Join-Path $databasePath "e2e.sqlite"
if (Test-Path -LiteralPath $e2eDatabasePath) {
    Remove-Item -LiteralPath $e2eDatabasePath -Force
}
New-Item -ItemType File -Path $e2eDatabasePath -Force | Out-Null
$env:DB_CONNECTION = "sqlite"
$env:DB_DATABASE = $e2eDatabasePath

& $phpCommand artisan optimize:clear
& $phpCommand artisan migrate:fresh --seed --force
$vendorDirectory = if ([string]::IsNullOrWhiteSpace($env:COMPOSER_VENDOR_DIR)) {
    "vendor"
}
else {
    $env:COMPOSER_VENDOR_DIR
}
$vendorPath = if ([System.IO.Path]::IsPathRooted($vendorDirectory)) {
    $vendorDirectory
}
else {
    Join-Path (Get-Location) $vendorDirectory
}
$laravelServer = Join-Path $vendorPath "laravel\framework\src\Illuminate\Foundation\resources\server.php"
if (-not (Test-Path -LiteralPath $laravelServer -PathType Leaf)) {
    throw "Laravel development server entrypoint was not found at $laravelServer."
}
Set-Location ".\public"
& $phpCommand -S "localhost:$Port" $laravelServer
