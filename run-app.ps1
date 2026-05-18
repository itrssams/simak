param(
    [ValidateSet('', 'development', 'production')]
    [string]$Mode = '',

    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [int]$ProductionPort = 8600,

    [switch]$InstallDeps
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root 'backend'
$FrontendDir = Join-Path $Root 'frontend'
$Python = Join-Path $Root '.venv\Scripts\python.exe'
$Pip = Join-Path $Root '.venv\Scripts\pip.exe'
$BackendEnv = Join-Path $BackendDir ".env.$Mode"

if ([string]::IsNullOrWhiteSpace($Mode)) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  SIMAK" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Pilih mode yang mau dijalankan:"
    Write-Host ""
    Write-Host "1. Development" -ForegroundColor Green
    Write-Host "2. Production" -ForegroundColor Yellow
    Write-Host ""

    do {
        $choice = Read-Host "Ketik 1 atau 2"
    } until ($choice -in @('1', '2'))

    if ($choice -eq '1') {
        $Mode = 'development'
    } else {
        $Mode = 'production'
    }

    $BackendEnv = Join-Path $BackendDir ".env.$Mode"
}

function Assert-File($Path, $Message) {
    if (-not (Test-Path $Path)) {
        throw $Message
    }
}

Assert-File $Python "Virtualenv tidak ditemukan. Buat dulu dengan: python -m venv .venv"
Assert-File $BackendEnv "File env backend tidak ditemukan: $BackendEnv"

if ($InstallDeps) {
    Write-Host "[deps] Install Python dependencies..." -ForegroundColor Cyan
    & $Pip install -r (Join-Path $Root 'requirements.txt')

    Write-Host "[deps] Install frontend dependencies..." -ForegroundColor Cyan
    Push-Location $FrontendDir
    npm install
    Pop-Location
}

if ($Mode -eq 'development') {
    Write-Host ""
    Write-Host "Menjalankan mode DEVELOPMENT" -ForegroundColor Green
    Write-Host "Backend env : $BackendEnv"
    Write-Host "Frontend    : http://localhost:$FrontendPort atau http://192.168.44.15:$FrontendPort"
    Write-Host "Backend API : http://localhost:$BackendPort/api"
    Write-Host ""

    $backendCommand = @"
`$env:DJANGO_ENV='development'
`$env:ENV_FILE='$BackendEnv'
Set-Location '$BackendDir'
& '$Python' manage.py runserver 0.0.0.0:$BackendPort
"@

    $frontendCommand = @"
Set-Location '$FrontendDir'
`$env:VITE_API_URL='/api'
npm run dev -- --host 0.0.0.0 --port $FrontendPort
"@

    Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand
    Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand

    Write-Host "Dua window PowerShell sudah dibuka untuk backend dan frontend." -ForegroundColor Green
    return
}

Write-Host ""
Write-Host "Menjalankan mode PRODUCTION" -ForegroundColor Green
Write-Host "Backend env : $BackendEnv"
Write-Host "Domain      : https://simak.rssiaga.id"
Write-Host ""

$env:DJANGO_ENV = 'production'
$env:ENV_FILE = $BackendEnv

Write-Host "[1/5] Build frontend..." -ForegroundColor Cyan
Push-Location $FrontendDir
npm run build
Pop-Location

Write-Host "[2/5] Check Django..." -ForegroundColor Cyan
Push-Location $BackendDir
& $Python manage.py check --deploy

Write-Host "[3/5] Migrasi database..." -ForegroundColor Cyan
& $Python manage.py migrate

Write-Host "[4/5] Collect static..." -ForegroundColor Cyan
& $Python manage.py collectstatic --noinput

Write-Host "[5/5] Start server..." -ForegroundColor Cyan
Write-Host "Aplikasi listen di http://0.0.0.0:$ProductionPort" -ForegroundColor Green
Write-Host "Pastikan reverse proxy mengarah ke port ini dan mengirim X-Forwarded-Proto=https." -ForegroundColor Yellow
& $Python -m waitress --listen=0.0.0.0:$ProductionPort config.wsgi:application
Pop-Location
