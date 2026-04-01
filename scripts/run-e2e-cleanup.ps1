$ErrorActionPreference = "Stop"

function Stop-ProcessOnPort {
    param([int]$TargetPort)

    $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        try {
            Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
        }
        catch {
            # Ignore cleanup failures and let subsequent startup fail with context.
        }
    }
}

function Stop-NextDevProcessesForProject {
    param([string]$ProjectRoot)

    $escapedProjectRoot = [Regex]::Escape($ProjectRoot)
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object {
            $_.CommandLine -match 'next\s+dev' -and $_.CommandLine -match $escapedProjectRoot
        }

    foreach ($process in $processes) {
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
        }
        catch {
            # Ignore cleanup failures and let subsequent startup fail with context.
        }
    }
}

Stop-ProcessOnPort -TargetPort 8100
Stop-ProcessOnPort -TargetPort 3100
Stop-ProcessOnPort -TargetPort 3000
Stop-ProcessOnPort -TargetPort 3001

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
Stop-NextDevProcessesForProject -ProjectRoot $projectRoot

$lockFilePath = Join-Path $projectRoot ".next\dev\lock"
if (Test-Path $lockFilePath) {
    try {
        Remove-Item -Path $lockFilePath -Force -ErrorAction Stop
    }
    catch {
        # Ignore cleanup failures and let subsequent startup fail with context.
    }
}
