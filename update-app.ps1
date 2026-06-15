$ErrorActionPreference = "Stop"

Clear-Host

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "         UPDATE APLIKASI SIMAK" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

# =========================
# CEK VENV
# =========================

$venvActivate = Join-Path $ProjectRoot ".venv\Scripts\Activate.ps1"

if (!(Test-Path $venvActivate)) {
    Write-Host "Virtual Environment tidak ditemukan!" -ForegroundColor Red
    Write-Host $venvActivate
    Pause
    exit
}

& $venvActivate

# =========================
# GIT PULL
# =========================

Write-Host "Git Pull..." -ForegroundColor Yellow
git pull origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "Git pull gagal! Cek koneksi atau konflik." -ForegroundColor Red
    Pause
    exit
}

# =========================
# PYTHON DEPENDENCIES
# =========================

Write-Host ""
Write-Host "Install Python Requirements..." -ForegroundColor Yellow
pip install -r requirements.txt

# =========================
# DJANGO MIGRATE & COLLECTSTATIC
# =========================

Write-Host ""
Write-Host "Migrasi Database..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\backend"
python manage.py migrate

Write-Host ""
Write-Host "Collect Static..." -ForegroundColor Yellow
python manage.py collectstatic --noinput

# =========================
# FRONTEND
# =========================

Set-Location "$ProjectRoot\frontend"

Write-Host ""
Write-Host "Install NPM Package..." -ForegroundColor Yellow
npm install

Write-Host ""
Write-Host "Build Frontend..." -ForegroundColor Yellow
npm run build

# =========================
# SELESAI
# =========================

Set-Location $ProjectRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "        UPDATE BERHASIL SELESAI" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

Pause