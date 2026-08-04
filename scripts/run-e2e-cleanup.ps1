$ErrorActionPreference = "Stop"

function Stop-ProcessOnPort {
    param([int]$TargetPort)

    $processIds = @(
        Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess
    )

    if ($processIds.Count -eq 0) {
        $netstatPattern = "^\s*TCP\s+\S+:$TargetPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
        $processIds = @(
            netstat -ano |
                ForEach-Object {
                    if ($_ -match $netstatPattern) {
                        [int]$Matches[1]
                    }
                }
        )
    }

    foreach ($ownerProcessId in ($processIds | Sort-Object -Unique)) {
        try {
            if ($ownerProcessId -gt 0 -and $ownerProcessId -ne $PID) {
                Stop-Process -Id $ownerProcessId -Force -ErrorAction Stop
            }
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
$lockFilePath = Join-Path $projectRoot ".next\dev\lock"
if (Test-Path $lockFilePath) {
    try {
        Remove-Item -Path $lockFilePath -Force -ErrorAction Stop
    }
    catch {
        # Ignore cleanup failures and let subsequent startup fail with context.
    }
}
