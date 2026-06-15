$ErrorActionPreference = "Stop"

function Show-Header {
    Clear-Host
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "         SETUP AWAL SIMAK" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host ">> $Text" -ForegroundColor Cyan
    Write-Host "------------------------------------------" -ForegroundColor DarkGray
}

function Write-OK {
    param([string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Text)
    Write-Host "[GAGAL] $Text" -ForegroundColor Red
}

function Write-Skip {
    param([string]$Text)
    Write-Host "[SKIP] $Text" -ForegroundColor Yellow
}

function Pause-Exit {
    Write-Host ""
    Write-Host "Setup dihentikan." -ForegroundColor Red
    Pause
    exit
}

# ==========================
# CEK PREREQUISITES
# ==========================

function Check-Prerequisites {
    Write-Step "Mengecek Prerequisites"

    $allOk = $true

    # Python
    try {
        $pyVersion = python --version 2>&1
        Write-OK "Python: $pyVersion"
    } catch {
        Write-Fail "Python tidak ditemukan. Install dari https://python.org"
        $allOk = $false
    }

    # Node.js
    try {
        $nodeVersion = node --version 2>&1
        Write-OK "Node.js: $nodeVersion"
    } catch {
        Write-Fail "Node.js tidak ditemukan. Install dari https://nodejs.org"
        $allOk = $false
    }

    # npm
    try {
        $npmVersion = npm --version 2>&1
        Write-OK "npm: v$npmVersion"
    } catch {
        Write-Fail "npm tidak ditemukan."
        $allOk = $false
    }

    # Git
    try {
        $gitVersion = git --version 2>&1
        Write-OK "Git: $gitVersion"
    } catch {
        Write-Fail "Git tidak ditemukan. Install dari https://git-scm.com"
        $allOk = $false
    }

    # MySQL / MariaDB (cek via mysqldump)
    $mysqldumpCandidates = @(
        "C:\xampp\mysql\bin\mysqldump.exe",
        "D:\xampp\mysql\bin\mysqldump.exe",
        "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe",
        "C:\Program Files\MySQL\MySQL Server 5.7\bin\mysqldump.exe"
    )
    $mysqlFound = $false
    foreach ($c in $mysqldumpCandidates) {
        if (Test-Path $c) {
            Write-OK "MySQL/MariaDB ditemukan: $c"
            $mysqlFound = $true
            break
        }
    }
    if (!$mysqlFound) {
        $fromPath = Get-Command mysqldump -ErrorAction SilentlyContinue
        if ($fromPath) {
            Write-OK "MySQL/MariaDB ditemukan di PATH"
            $mysqlFound = $true
        }
    }
    if (!$mysqlFound) {
        Write-Fail "MySQL/MariaDB tidak ditemukan. Install XAMPP atau MySQL Server."
        $allOk = $false
    }

    if (!$allOk) {
        Write-Host ""
        Write-Host "Ada prerequisites yang belum terpenuhi." -ForegroundColor Red
        Write-Host "Install yang kurang lalu jalankan setup ini lagi." -ForegroundColor Yellow
        Pause-Exit
    }

    Write-Host ""
    Write-OK "Semua prerequisites OK."
}

# ==========================
# BUAT VIRTUAL ENVIRONMENT
# ==========================

function Setup-Venv {
    Write-Step "Membuat Virtual Environment"

    $venvPath = Join-Path $PSScriptRoot ".venv"

    if (Test-Path $venvPath) {
        Write-Skip "Virtual environment sudah ada, skip."
        return
    }

    python -m venv .venv

    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Gagal membuat virtual environment."
        Pause-Exit
    }

    Write-OK "Virtual environment berhasil dibuat."
}

# ==========================
# INSTALL PYTHON DEPS
# ==========================

function Install-PythonDeps {
    Write-Step "Install Python Dependencies"

    $pip = Join-Path $PSScriptRoot ".venv\Scripts\pip.exe"
    $requirements = Join-Path $PSScriptRoot "requirements.txt"

    if (!(Test-Path $requirements)) {
        Write-Fail "requirements.txt tidak ditemukan di $PSScriptRoot"
        Pause-Exit
    }

    & $pip install -r $requirements

    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Gagal install Python dependencies."
        Pause-Exit
    }

    Write-OK "Python dependencies berhasil diinstall."
}

# ==========================
# SETUP FILE .ENV
# ==========================

function Setup-EnvFile {
    Write-Step "Setup File .env"

    $envDev  = Join-Path $PSScriptRoot "backend\.env.development"
    $envProd = Join-Path $PSScriptRoot "backend\.env.production"
    $envExample = Join-Path $PSScriptRoot "backend\.env.example"

    if ((Test-Path $envDev) -and (Test-Path $envProd)) {
        Write-Skip ".env.development dan .env.production sudah ada, skip."
        return
    }

    if (Test-Path $envExample) {
        if (!(Test-Path $envDev)) {
            Copy-Item $envExample $envDev
            Write-OK ".env.development dibuat dari .env.example"
        }
        if (!(Test-Path $envProd)) {
            Copy-Item $envExample $envProd
            Write-OK ".env.production dibuat dari .env.example"
            Write-Host "     Jangan lupa update SECRET_KEY dan setting lain di .env.production!" -ForegroundColor Yellow
        }
    } else {
        # Buat .env.development
        if (!(Test-Path $envDev)) {
            @"
SECRET_KEY=dev-only-change-me-simak-local-secret-key-2026
DEBUG=True
PUBLIC_DOMAIN=localhost
PUBLIC_SCHEME=http
PUBLIC_BASE_URL=http://localhost:8000
ALLOWED_HOSTS=localhost,127.0.0.1
DB_NAME=simak_dev
DB_USER=root
DB_PASSWORD=
DB_HOST=127.0.0.1
DB_PORT=3306
"@ | Out-File -FilePath $envDev -Encoding utf8
            Write-OK ".env.development dibuat (default development)."
        }

        # Buat .env.production
        if (!(Test-Path $envProd)) {
            $randomKey = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
            @"
SECRET_KEY=$randomKey
DEBUG=False
PUBLIC_DOMAIN=localhost
PUBLIC_SCHEME=http
PUBLIC_BASE_URL=http://localhost:8000
ALLOWED_HOSTS=localhost,127.0.0.1
DB_NAME=simak
DB_USER=root
DB_PASSWORD=
DB_HOST=127.0.0.1
DB_PORT=3306
"@ | Out-File -FilePath $envProd -Encoding utf8
            Write-OK ".env.production dibuat."
            Write-Host "     Jangan lupa update PUBLIC_DOMAIN dan setting lain di .env.production!" -ForegroundColor Yellow
        }
    }
}

# ==========================
# MIGRATE DATABASE
# ==========================

function Setup-Migrate {
    Write-Step "Migrasi Database"

    $python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

    Write-Host "Pilih target database untuk migrasi awal:"
    Write-Host "[1] simak_dev (Development)"
    Write-Host "[2] simak     (Production)"
    Write-Host "[3] Keduanya"
    Write-Host "[0] Skip"
    Write-Host ""
    $pilihan = Read-Host "Pilih"

    $targets = @()
    switch ($pilihan) {
        "1" { $targets = @(@{ db = "simak_dev"; env = "development" }) }
        "2" { $targets = @(@{ db = "simak";     env = "production"  }) }
        "3" { $targets = @(@{ db = "simak_dev"; env = "development" }, @{ db = "simak"; env = "production" }) }
        "0" { Write-Skip "Migrasi database dilewati."; return }
        default { Write-Skip "Pilihan tidak valid, skip."; return }
    }

    foreach ($target in $targets) {
        Write-Host ""
        Write-Host "Migrasi ke $($target.db)..." -ForegroundColor Yellow
        $env:DJANGO_ENV = $target.env
        & $python "$PSScriptRoot\backend\manage.py" migrate

        if ($LASTEXITCODE -eq 0) {
            Write-OK "Migrate ke $($target.db) berhasil."
        } else {
            Write-Fail "Migrate ke $($target.db) gagal. Pastikan database sudah dibuat di MySQL."
        }
    }
}

# ==========================
# INSTALL NPM & BUILD
# ==========================

function Setup-Frontend {
    Write-Step "Install & Build Frontend"

    $frontendPath = Join-Path $PSScriptRoot "frontend"

    if (!(Test-Path $frontendPath)) {
        Write-Fail "Folder frontend tidak ditemukan."
        Pause-Exit
    }

    Set-Location $frontendPath

    Write-Host "Install NPM dependencies..." -ForegroundColor Yellow
    npm install

    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install gagal."
        Set-Location $PSScriptRoot
        Pause-Exit
    }

    Write-Host ""
    Write-Host "Build frontend..." -ForegroundColor Yellow
    npm run build

    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm build gagal."
        Set-Location $PSScriptRoot
        Pause-Exit
    }

    Set-Location $PSScriptRoot
    Write-OK "Frontend berhasil diinstall dan di-build."
}

# ==========================
# COLLECT STATIC
# ==========================

function Setup-CollectStatic {
    Write-Step "Collect Static Files"

    $python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
    $env:DJANGO_ENV = "production"

    & $python "$PSScriptRoot\backend\manage.py" collectstatic --noinput

    if ($LASTEXITCODE -eq 0) {
        Write-OK "Collectstatic berhasil."
    } else {
        Write-Fail "Collectstatic gagal."
    }
}

# ==========================
# BUAT SUPERUSER
# ==========================

function Setup-Superuser {
    Write-Step "Buat Superuser Django"

    Write-Host "Pilih target database:"
    Write-Host "[1] simak_dev (Development)"
    Write-Host "[2] simak     (Production)"
    Write-Host "[3] Keduanya"
    Write-Host "[0] Skip"
    Write-Host ""
    $pilihan = Read-Host "Pilih"

    $targets = @()
    switch ($pilihan) {
        "1" { $targets = @(@{ db = "simak_dev"; env = "development" }) }
        "2" { $targets = @(@{ db = "simak";     env = "production"  }) }
        "3" { $targets = @(@{ db = "simak_dev"; env = "development" }, @{ db = "simak"; env = "production" }) }
        "0" { Write-Skip "Pembuatan superuser dilewati."; return }
        default { Write-Skip "Pilihan tidak valid, skip."; return }
    }

    $python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

    foreach ($target in $targets) {
        Write-Host ""
        Write-Host "Buat superuser untuk $($target.db)..." -ForegroundColor Yellow
        $env:DJANGO_ENV = $target.env
        & $python "$PSScriptRoot\backend\manage.py" createsuperuser

        if ($LASTEXITCODE -eq 0) {
            Write-OK "Superuser untuk $($target.db) berhasil dibuat."
        } else {
            Write-Fail "Gagal buat superuser untuk $($target.db)."
        }
    }
}

# ==========================
# MAIN
# ==========================

Show-Header

Write-Host "Script ini akan melakukan setup awal aplikasi SIMAK." -ForegroundColor White
Write-Host "Pastikan sudah pull dari GitHub sebelum menjalankan ini." -ForegroundColor Yellow
Write-Host ""
$mulai = Read-Host "Lanjutkan setup? (Y/N)"

if ($mulai -ine "Y") {
    Write-Host "Setup dibatalkan." -ForegroundColor Yellow
    exit
}

Check-Prerequisites
Setup-Venv
Install-PythonDeps
Setup-EnvFile
Setup-Migrate
Setup-Frontend
Setup-CollectStatic
Setup-Superuser

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "       SETUP SELESAI!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Selanjutnya jalankan RUN_APP.bat untuk mengelola server." -ForegroundColor Cyan
Write-Host ""

Pause