param(
    [int]$Port = 3100,
    [string]$ApiUrl = "http://localhost:8100/api"
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

$env:NEXT_PUBLIC_API_URL = $ApiUrl

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $projectRoot
npm run dev -- --hostname localhost --port $Port
