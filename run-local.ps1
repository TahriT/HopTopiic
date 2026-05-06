param(
  [string]$RepoRoot = "$(Split-Path -Parent $MyInvocation.MyCommand.Path)"
)

$ErrorActionPreference = "Stop"

Write-Host "[HopTopiic] Starting local dev services..." -ForegroundColor Cyan
Set-Location $RepoRoot

$venvActivate = Join-Path $RepoRoot ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
  throw "Virtualenv not found at $venvActivate"
}

# Backend in a new PowerShell window
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned; Set-Location '$RepoRoot'; & '$venvActivate'; python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000"
)

# Frontend in a new PowerShell window
$frontendRoot = Join-Path $RepoRoot "frontend"
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned; Set-Location '$frontendRoot'; if (-not (Test-Path 'node_modules')) { npm ci }; npx vite --host 0.0.0.0 --port 5173"
)

Write-Host "[HopTopiic] Backend:  http://localhost:8000" -ForegroundColor Green
Write-Host "[HopTopiic] Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "[HopTopiic] OBS Overlay: http://localhost:5173/?overlay=true" -ForegroundColor Green
Write-Host "[HopTopiic] Pipeline viewer: http://localhost:4000" -ForegroundColor Green
