# Start admin API on port 8001 (needs Postgres/Redis — use docker compose up -d postgres redis first).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Find-Python {
    $paths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:ProgramFiles\Python313\python.exe",
        "$env:ProgramFiles\Python312\python.exe",
        "$env:ProgramFiles\Python311\python.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    if (Get-Command py -ErrorAction SilentlyContinue) {
        return "py"
    }
    $cmd = Get-Command python3 -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -notmatch "WindowsApps") { return $cmd.Source }
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pyCmd -and $pyCmd.Source -notmatch "WindowsApps") { return $pyCmd.Source }
    return $null
}

function Ensure-Deps([string]$PythonExe, [switch]$UsePyLauncher) {
    $req = Join-Path $PSScriptRoot "requirements.txt"
    $ok = $false
    if ($UsePyLauncher) {
        & py -3 -c "import uvicorn" 2>$null
        if ($LASTEXITCODE -eq 0) { $ok = $true }
    } else {
        & $PythonExe -c "import uvicorn" 2>$null
        if ($LASTEXITCODE -eq 0) { $ok = $true }
    }
    if ($ok) { return }
    Write-Host "Installing dependencies (pip install -r requirements.txt)..." -ForegroundColor Yellow
    if ($UsePyLauncher) {
        & py -3 -m pip install -r $req
    } else {
        & $PythonExe -m pip install -r $req
    }
}

$py = Find-Python
if (-not $py) {
    Write-Host @"

Python not found. Fix ONE of these:

  1) Install Python 3.11+ from https://www.python.org/downloads/
     — Check "Add python.exe to PATH"
     — In Settings > Apps > Advanced app execution aliases: TURN OFF "python.exe" / "python3.exe" (Store stubs)

  2) Or run admin via Docker (no local Python needed):
     cd ..\..
     docker compose up -d postgres redis
     docker compose up -d --build admin-api

"@ -ForegroundColor Yellow
    exit 1
}

Write-Host "Using: $py" -ForegroundColor Cyan
if ($py -eq "py") {
    Ensure-Deps -UsePyLauncher
    & py -3 run.py
} else {
    Ensure-Deps -PythonExe $py
    & $py run.py
}
