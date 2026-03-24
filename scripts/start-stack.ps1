# Start full ProTrader Docker stack (DB, Redis, Kafka, gateway :8000, admin-api :8001, engines).
# Usage: .\scripts\start-stack.ps1   (from repo root, or any path — script cds to repo root)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "Building and starting services..." -ForegroundColor Cyan
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose failed. Is Docker Desktop running?" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`nStatus:" -ForegroundColor Cyan
docker compose ps

Write-Host "`nURLs:" -ForegroundColor Green
Write-Host "  Trader API (gateway):  http://localhost:8000/health"
Write-Host "  Admin API:            http://localhost:8001/health"
Write-Host "  Kafka UI:             http://localhost:8080"
Write-Host "`nThen run trader UI:  cd frontend/trader && npm run dev" -ForegroundColor Yellow
