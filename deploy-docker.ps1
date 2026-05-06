param(
  [string]$RepoRoot = "$(Split-Path -Parent $MyInvocation.MyCommand.Path)"
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

Write-Host "[HopTopiic] Building and deploying with Docker Compose..." -ForegroundColor Cyan
docker compose up --build -d

Write-Host "[HopTopiic] Waiting for API readiness..." -ForegroundColor Yellow
$maxTries = 30
for ($i = 1; $i -le $maxTries; $i++) {
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:8000/api/status" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) {
      Write-Host "[HopTopiic] API is healthy." -ForegroundColor Green
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }

  if ($i -eq $maxTries) {
    throw "API did not become healthy in time. Check: docker compose logs -f"
  }
}

Write-Host "[HopTopiic] App URL:        http://localhost:8000" -ForegroundColor Green
Write-Host "[HopTopiic] OBS Overlay:    http://localhost:8000/?overlay=true" -ForegroundColor Green
Write-Host "[HopTopiic] Status endpoint: http://localhost:8000/api/status" -ForegroundColor Green
Write-Host "[HopTopiic] Pipeline viewer: http://localhost:4000" -ForegroundColor Green
