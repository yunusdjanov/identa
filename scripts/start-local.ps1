param(
    [int]$FrontendPort = 3000,
    [int]$BackendPort = 8001
)

$ErrorActionPreference = "Stop"

function Stop-ProcessOnPort {
    param([int]$TargetPort)

    $processIds = netstat -ano |
        Select-String "LISTENING" |
        ForEach-Object {
            $parts = (($_.ToString() -split '\s+') | Where-Object { $_ -ne '' })
            if ($parts.Length -ge 5 -and $parts[1] -like "*:$TargetPort") {
                return [int]$parts[-1]
            }
        } |
        Where-Object { $_ -gt 0 } |
        Sort-Object -Unique

    foreach ($processId in $processIds) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch {
            # Best-effort cleanup for local dev ports.
        }
    }
}

function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }

    throw "Timed out waiting for $Url"
}

$repoRoot = Resolve-Path "$PSScriptRoot\.."

Stop-ProcessOnPort -TargetPort $FrontendPort

Start-Process -FilePath "powershell" -ArgumentList @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ".\scripts\run-backend.ps1",
    "-Port",
    $BackendPort,
    "-BindHost",
    "0.0.0.0"
) -WorkingDirectory $repoRoot -WindowStyle Hidden

Start-Process -FilePath "powershell" -ArgumentList @(
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "npm.cmd run dev -- --hostname 127.0.0.1 --port $FrontendPort"
) -WorkingDirectory $repoRoot -WindowStyle Hidden

Wait-HttpReady -Url "http://127.0.0.1:$BackendPort/api/v1/health"
Wait-HttpReady -Url "http://127.0.0.1:$FrontendPort/login"

Write-Host "Local frontend: http://127.0.0.1:$FrontendPort"
Write-Host "Local backend:  http://127.0.0.1:$BackendPort"
