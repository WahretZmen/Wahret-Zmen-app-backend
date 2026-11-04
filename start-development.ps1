
# ==========================================
# WAHRET ZMEN - LOCAL BACKEND STARTUP
# ==========================================

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

# Load the base environment.
# Load local overrides afterward.
# Never print secret values.

function Import-DotEnv {
    param(
        [string]$FilePath
    )

    if (-not (Test-Path $FilePath)) {
        throw "Environment file not found: $FilePath"
    }

    Get-Content $FilePath | ForEach-Object {
        $line = $_.Trim()

        if (
            $line -eq "" -or
            $line.StartsWith("#")
        ) {
            return
        }

        $parts = $line -split "=", 2

        if ($parts.Count -ne 2) {
            return
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim()

        if ($name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
            return
        }

        # Remove optional surrounding quotes.
        if (
            $value.Length -ge 2 -and
            (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))
            )
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        [Environment]::SetEnvironmentVariable(
            $name,
            $value,
            "Process"
        )
    }
}

Import-DotEnv ".env"
Import-DotEnv ".env.development.local"

Write-Host "========================================"
Write-Host "WAHRET ZMEN - DEVELOPMENT BACKEND"
Write-Host "========================================"
Write-Host "Environment: $env:NODE_ENV"
Write-Host "Node port: $env:PORT"
Write-Host "AI URL: $env:AM_HSSIN_API_URL"
Write-Host "========================================"

# Start the existing npm development command.
npm run start:dev
