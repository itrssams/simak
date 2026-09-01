$ErrorActionPreference = "Stop"

function Show-Header {
    Clear-Host
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "              SIMAK SERVER" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Test-Port {
    param([int]$Port)
    try {
        return $null -ne (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)
    } catch {
        return $false
    }
}

function Get-PortPID {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conn) { return ($conn | Select-Object -First 1).OwningProcess }
        return $null
    } catch {
        return $null
    }
}

function Stop-PortProcess {
    param([int]$Port)
    $processId = Get-PortPID $Port
    if ($processId) {
        try {
            Stop-Process -Id $processId -Force
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "Gagal menghentikan PID $processId" -ForegroundColor Red
        }
    }
}

function Get-VenvPython {
    $python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
    if (!(Test-Path $python)) {
        Write-Host ""
        Write-Host "Virtual Environment tidak ditemukan!" -ForegroundColor Red
        Write-Host $python
        Pause
        return $null
    }
    return $python
}

function Set-DjangoEnv {
    param([string]$Env)
    $env:DJANGO_ENV = $Env
    Write-Host "DJANGO_ENV=$Env" -ForegroundColor DarkGray
}

function Select-Database {
    Write-Host ""
    Write-Host "Pilih Target Database:" -ForegroundColor Cyan
    Write-Host "[1] simak_dev (Development)"
    Write-Host "[2] simak     (Production)"
    Write-Host "[3] rssams    (Legacy SIMRS)"
    Write-Host "[0] Batal"
    Write-Host ""
    $pilihan = Read-Host "Pilih"

    switch ($pilihan) {
        "1" { return @{ db = "simak_dev"; env = "development" } }
        "2" { return @{ db = "simak";     env = "production"  } }
        "3" { return @{ db = "rssams";    env = "production"  } }
        "0" { return $null }
        default {
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
            return $null
        }
    }
}

function Get-MySQLBinPath {
    param([string]$Exe)
    $candidates = @(
        "C:\xampp\mysql\bin\$Exe",
        "D:\xampp\mysql\bin\$Exe",
        "C:\Program Files\MySQL\MySQL Server 8.0\bin\$Exe",
        "C:\Program Files\MySQL\MySQL Server 5.7\bin\$Exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    $fromPath = Get-Command $Exe -ErrorAction SilentlyContinue
    if ($fromPath) { return $fromPath.Source }
    return $null
}

function Get-DbCredentials {
    $creds = @{ user = "root"; password = ""; host = "127.0.0.1" }
    $envFile = Join-Path $PSScriptRoot ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match "^DB_USER=(.+)")    { $creds.user     = $Matches[1].Trim() }
            if ($_ -match "^DB_PASSWORD=(.*)") { $creds.password = $Matches[1].Trim() }
            if ($_ -match "^DB_HOST=(.+)")    { $creds.host     = $Matches[1].Trim() }
        }
    }
    return $creds
}

# ==========================
# SERVER
# ==========================

function Start-Development {
    Show-Header

    if (Test-Port 8000 -or Test-Port 5173) {
        Write-Host "Development sudah berjalan." -ForegroundColor Yellow
        Write-Host ""
        $jawab = Read-Host "Restart Development? (Y/N)"
        if ($jawab -ieq "Y") {
            Stop-PortProcess 8000
            Stop-PortProcess 5173
        } else { return }
    }

    Write-Host ""
    Write-Host "Menjalankan Backend..." -ForegroundColor Green
    Start-Process powershell `
        -ArgumentList "-NoExit","-Command","`$env:DJANGO_ENV='development'; cd '$PSScriptRoot\backend'; & '$PSScriptRoot\.venv\Scripts\python.exe' manage.py runserver 0.0.0.0:8000"

    Start-Sleep -Seconds 3

    Write-Host "Menjalankan Frontend..." -ForegroundColor Green
    Start-Process powershell `
        -ArgumentList "-NoExit","-Command","cd '$PSScriptRoot\frontend'; npm run dev -- --host 0.0.0.0 --port 5173"

    Write-Host ""
    Write-Host "Backend  : http://localhost:8000" -ForegroundColor Green
    Write-Host "Frontend : http://localhost:5173" -ForegroundColor Green
    Pause
}

function Start-Production {
    Show-Header

    if (Test-Port 8900) {
        Write-Host "Production sudah berjalan." -ForegroundColor Yellow
        $jawab = Read-Host "Restart Production? (Y/N)"
        if ($jawab -ieq "Y") {
            Stop-PortProcess 8900
        } else { Pause; return }
    }

    $python = Get-VenvPython
    if (!$python) { return }

    Set-DjangoEnv "production"
    Set-Location "$PSScriptRoot\backend"

    Write-Host ""
    Write-Host "Menjalankan Waitress (DB: simak)..." -ForegroundColor Green
    Write-Host ""

    & $python -m waitress `
        --listen=0.0.0.0:8900 `
        --threads=8 `
        --connection-limit=500 `
        --channel-timeout=30 `
        --cleanup-interval=10 `
        config.wsgi:application
}

function Stop-Development {
    Show-Header
    Stop-PortProcess 8000
    Stop-PortProcess 5173
    Write-Host ""
    Write-Host "Development berhasil dihentikan." -ForegroundColor Green
    Pause
}

function Stop-Production {
    Show-Header
    Stop-PortProcess 8900
    Write-Host ""
    Write-Host "Production berhasil dihentikan." -ForegroundColor Green
    Pause
}

function Restart-Development {
    Stop-PortProcess 8000
    Stop-PortProcess 5173
    Start-Sleep -Seconds 2
    Start-Development
}

function Restart-Production {
    Stop-PortProcess 8900
    Start-Sleep -Seconds 2
    Start-Production
}

# ==========================
# DJANGO
# ==========================

function Setup-Database {
    Show-Header
    Write-Host "  SETUP DATABASE" -ForegroundColor Cyan
    Write-Host ""

    $mysql = Get-MySQLBinPath "mysql.exe"
    if (!$mysql) {
        Write-Host "mysql.exe tidak ditemukan!" -ForegroundColor Red
        Write-Host "Pastikan XAMPP/MySQL sudah terinstall." -ForegroundColor Yellow
        Pause
        return
    }

    Write-Host "MySQL: $mysql" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Pilih database yang akan dibuat:"
    Write-Host "[1] simak_dev (Development)"
    Write-Host "[2] simak     (Production)"
    Write-Host "[3] rssams    (Legacy SIMRS)"
    Write-Host "[4] Semua (simak_dev, simak, rssams)"
    Write-Host "[0] Batal"
    Write-Host ""
    $pilihan = Read-Host "Pilih"

    $dbList = @()
    switch ($pilihan) {
        "1" { $dbList = @("simak_dev") }
        "2" { $dbList = @("simak") }
        "3" { $dbList = @("rssams") }
        "4" { $dbList = @("simak_dev", "simak", "rssams") }
        "0" { return }
        default {
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
            return
        }
    }

    if ($dbList -contains "simak") {
        Write-Host ""
        Write-Host "  PERINGATAN: Akan membuat database PRODUCTION!" -ForegroundColor Red
        Write-Host ""
        $konfirmasi = Read-Host "Ketik Y untuk lanjut"
        if ($konfirmasi -ine "Y") { return }
    }

    $creds = Get-DbCredentials
    $authArgs = @("-h", $creds.host, "-u", $creds.user)
    if ($creds.password -ne "") { $authArgs += "-p$($creds.password)" }

    foreach ($db in $dbList) {
        Write-Host ""
        Write-Host "Membuat database $db..." -ForegroundColor Yellow
        $sql = "CREATE DATABASE IF NOT EXISTS ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        $result = $sql | & $mysql @authArgs 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Database $db OK." -ForegroundColor Green
        } else {
            Write-Host "Gagal: $result" -ForegroundColor Red
        }
    }

    Write-Host ""
    $jawab = Read-Host "Jalankan Django migrate sekarang? (Y/N)"
    if ($jawab -ieq "Y") {
        $python = Get-VenvPython
        if ($python) {
            foreach ($db in $dbList) {
                $djangoEnv = if ($db -eq "simak") { "production" } else { "development" }
                Write-Host ""
                Write-Host "Migrate ke $db..." -ForegroundColor Yellow
                $env:DJANGO_ENV = $djangoEnv
                & $python "$PSScriptRoot\backend\manage.py" migrate
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Migrate $db berhasil." -ForegroundColor Green
                } else {
                    Write-Host "Migrate $db gagal." -ForegroundColor Red
                }
            }
        }
    }

    Write-Host ""
    Pause
}

function Run-Migrate {
    Show-Header
    Write-Host "  MIGRATE DATABASE DJANGO" -ForegroundColor Cyan
    Write-Host ""

    $selected = Select-Database
    if (!$selected) { return }

    $python = Get-VenvPython
    if (!$python) { return }

    if ($selected.db -eq "simak") {
        Write-Host ""
        Write-Host "  PERINGATAN: Akses ke database PRODUCTION ($($selected.db))!" -ForegroundColor Red
        Write-Host ""
        $konfirmasi = Read-Host "Ketik Y untuk lanjut"
        if ($konfirmasi -ine "Y") { return }
    }

    Write-Host ""
    Write-Host "Pilih Mode Migrasi untuk $($selected.db):"
    Write-Host "[1] Makemigrations + Migrate (Buat migrasi baru & terapkan)"
    Write-Host "[2] Migrate saja (Terapkan migrasi yang sudah ada)"
    Write-Host "[3] Makemigrations saja (Hanya buat file migrasi)"
    Write-Host "[0] Batal"
    Write-Host ""
    $mode = Read-Host "Pilih"

    $env:DJANGO_ENV = $selected.env

    switch ($mode) {
        "1" {
            Write-Host ""
            Write-Host "Menjalankan makemigrations..." -ForegroundColor Yellow
            & $python "$PSScriptRoot\backend\manage.py" makemigrations
            if ($LASTEXITCODE -eq 0) {
                Write-Host ""
                Write-Host "Menjalankan migrate ke $($selected.db)..." -ForegroundColor Yellow
                & $python "$PSScriptRoot\backend\manage.py" migrate
            }
        }
        "2" {
            Write-Host ""
            Write-Host "Menjalankan migrate ke $($selected.db)..." -ForegroundColor Yellow
            & $python "$PSScriptRoot\backend\manage.py" migrate
        }
        "3" {
            Write-Host ""
            Write-Host "Menjalankan makemigrations..." -ForegroundColor Yellow
            & $python "$PSScriptRoot\backend\manage.py" makemigrations
        }
        "0" { return }
        default {
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
            return
        }
    }

    Write-Host ""
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Proses migrasi selesai." -ForegroundColor Green
    } else {
        Write-Host "Proses migrasi gagal. Cek output di atas." -ForegroundColor Red
    }

    Pause
}

function Run-MigrasiInvoice {
    Show-Header
    Write-Host "  MIGRASI INVOICE DARI RSSAMS" -ForegroundColor Cyan
    Write-Host ""

    $selected = Select-Database
    if (!$selected) { return }

    $python = Get-VenvPython
    if (!$python) { return }

    if ($selected.db -eq "simak") {
        Write-Host ""
        Write-Host "  PERINGATAN: Migrasi invoice ke database PRODUCTION!" -ForegroundColor Red
        Write-Host ""
        $konfirmasi = Read-Host "Ketik Y untuk lanjut"
        if ($konfirmasi -ine "Y") { return }
    }

    Write-Host ""
    Write-Host "[1] Dry Run - Simulasi (tidak menyimpan)"
    Write-Host "[2] Jalankan Migrasi"
    Write-Host "[0] Batal"
    Write-Host ""
    $mode = Read-Host "Pilih"

    $env:DJANGO_ENV = $selected.env

    switch ($mode) {
        "1" {
            Write-Host ""
            Write-Host "Dry run ke $($selected.db)..." -ForegroundColor Yellow
            Write-Host ""
            & $python "$PSScriptRoot\backend\manage.py" migrate_invoices_from_rssams --dry-run
        }
        "2" {
            Write-Host ""
            Write-Host "Migrasi invoice ke $($selected.db)..." -ForegroundColor Yellow
            Write-Host ""
            & $python "$PSScriptRoot\backend\manage.py" migrate_invoices_from_rssams
        }
        "0" { return }
        default {
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
            return
        }
    }

    Write-Host ""
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Selesai." -ForegroundColor Green
    } else {
        Write-Host "Ada error. Cek output di atas." -ForegroundColor Red
    }

    Pause
}

function Run-Build {
    Show-Header
    Write-Host "  BUILD FRONTEND" -ForegroundColor Cyan
    Write-Host ""

    $frontendPath = "$PSScriptRoot\frontend"
    if (!(Test-Path $frontendPath)) {
        Write-Host "Folder frontend tidak ditemukan!" -ForegroundColor Red
        Pause
        return
    }

    Set-Location $frontendPath

    Write-Host "Install dependencies..." -ForegroundColor Yellow
    npm install

    Write-Host ""
    Write-Host "Build frontend..." -ForegroundColor Yellow
    npm run build

    Set-Location $PSScriptRoot

    Write-Host ""
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Build berhasil." -ForegroundColor Green
    } else {
        Write-Host "Build gagal. Cek output di atas." -ForegroundColor Red
    }

    Pause
}

function Run-CollectStatic {
    Show-Header
    Write-Host "  COLLECT STATIC" -ForegroundColor Cyan
    Write-Host ""

    $python = Get-VenvPython
    if (!$python) { return }

    Write-Host "Menjalankan collectstatic..." -ForegroundColor Yellow
    Write-Host ""

    & $python "$PSScriptRoot\backend\manage.py" collectstatic --noinput

    Write-Host ""
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Collectstatic berhasil." -ForegroundColor Green
    } else {
        Write-Host "Collectstatic gagal. Cek output di atas." -ForegroundColor Red
    }

    Pause
}

function Run-Update {
    Show-Header
    Write-Host "  UPDATE APLIKASI" -ForegroundColor Cyan
    Write-Host ""

    Set-Location $PSScriptRoot

    Write-Host "Git Pull..." -ForegroundColor Yellow
    git pull origin main

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Git pull gagal! Cek koneksi atau konflik." -ForegroundColor Red
        Pause
        return
    }

    $python = Get-VenvPython
    if (!$python) { return }

    Write-Host ""
    Write-Host "Install Python requirements..." -ForegroundColor Yellow
    & $python -m pip install -r requirements.txt

    Write-Host ""
    Write-Host "Migrate database..." -ForegroundColor Yellow
    Write-Host "[1] simak_dev saja"
    Write-Host "[2] simak saja"
    Write-Host "[3] Keduanya"
    Write-Host "[0] Skip migrate"
    Write-Host ""
    $pilihanMigrate = Read-Host "Pilih"

    $migrateList = @()
    switch ($pilihanMigrate) {
        "1" { $migrateList = @(@{ db = "simak_dev"; env = "development" }) }
        "2" { $migrateList = @(@{ db = "simak"; env = "production" }) }
        "3" { $migrateList = @(@{ db = "simak_dev"; env = "development" }, @{ db = "simak"; env = "production" }) }
    }

    foreach ($m in $migrateList) {
        Write-Host ""
        Write-Host "Migrate ke $($m.db)..." -ForegroundColor Yellow
        $env:DJANGO_ENV = $m.env
        & $python "$PSScriptRoot\backend\manage.py" migrate
    }

    Write-Host ""
    Write-Host "Build frontend..." -ForegroundColor Yellow
    Set-Location "$PSScriptRoot\frontend"
    npm install
    npm run build
    Set-Location $PSScriptRoot

    Write-Host ""
    Write-Host "Collect static..." -ForegroundColor Yellow
    & $python "$PSScriptRoot\backend\manage.py" collectstatic --noinput

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "       UPDATE SELESAI" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Pause
}

function Show-Status {
    Show-Header
    Write-Host "  STATUS SERVER" -ForegroundColor Cyan
    Write-Host ""

    # Port
    $ports = @(
        @{ port = 8000; label = "Backend Dev  (8000)" },
        @{ port = 5173; label = "Frontend Dev (5173)" },
        @{ port = 8900; label = "Production   (8900)" }
    )
    foreach ($p in $ports) {
        if (Test-Port $p.port) {
            Write-Host "$($p.label) : RUNNING" -ForegroundColor Green
        } else {
            Write-Host "$($p.label) : STOPPED" -ForegroundColor Red
        }
    }

    # MySQL service
    $mysql = Get-Service -Name mysql* -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($mysql) {
        $color = if ($mysql.Status -eq "Running") { "Green" } else { "Red" }
        Write-Host "MySQL Service        : $($mysql.Status)" -ForegroundColor $color
    } else {
        Write-Host "MySQL Service        : TIDAK TERDETEKSI" -ForegroundColor Yellow
    }

    # CPU
    $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
    if ($cpu) { Write-Host ("CPU Usage            : {0:N1}%" -f $cpu) }

    # RAM
    $os = Get-CimInstance Win32_OperatingSystem
    $totalRam = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $freeRam  = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $usedRam  = [math]::Round($totalRam - $freeRam, 2)
    Write-Host ("RAM Usage            : {0} GB / {1} GB" -f $usedRam, $totalRam)

    # Disk
    $disk = Get-PSDrive C -ErrorAction SilentlyContinue
    if ($disk) {
        $free = [math]::Round($disk.Free / 1GB, 2)
        Write-Host ("Disk C: Free         : {0} GB" -f $free)
    }

    # Uptime
    $uptime = (Get-Date) - $os.LastBootUpTime
    Write-Host ("Uptime               : {0} Hari {1} Jam" -f $uptime.Days, $uptime.Hours)

    # Git
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $commit = git -C $PSScriptRoot rev-parse --short HEAD 2>$null
        if ($commit) { Write-Host "Git Commit           : $commit" }
    }

    # Last backup
    $backupFolder = Join-Path $PSScriptRoot "backup"
    if (Test-Path $backupFolder) {
        $last = Get-ChildItem $backupFolder -Filter *.sql | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($last) {
            Write-Host ("Last Backup          : {0}" -f $last.LastWriteTime)
        } else {
            Write-Host "Last Backup          : Belum ada"
        }
    } else {
        Write-Host "Last Backup          : Folder backup tidak ditemukan"
    }

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Pause
}

function Run-Backup {
    Show-Header
    Write-Host "  BACKUP DATABASE" -ForegroundColor Cyan
    Write-Host ""

    $mysqldump = Get-MySQLBinPath "mysqldump.exe"
    if (!$mysqldump) {
        Write-Host "mysqldump tidak ditemukan!" -ForegroundColor Red
        Write-Host "Pastikan XAMPP/MySQL sudah terinstall." -ForegroundColor Yellow
        Pause
        return
    }

    Write-Host "mysqldump: $mysqldump" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Pilih database yang akan dibackup:"
    Write-Host "[1] simak_dev (Development)"
    Write-Host "[2] simak     (Production)"
    Write-Host "[3] Keduanya"
    Write-Host "[0] Batal"
    Write-Host ""
    $pilihan = Read-Host "Pilih"

    $dbList = @()
    switch ($pilihan) {
        "1" { $dbList = @("simak_dev") }
        "2" { $dbList = @("simak") }
        "3" { $dbList = @("simak_dev", "simak") }
        "0" { return }
        default {
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
            return
        }
    }

    $creds = Get-DbCredentials
    $authArgs = @("-h", $creds.host, "-u", $creds.user)
    if ($creds.password -ne "") { $authArgs += "-p$($creds.password)" }

    $backupFolder = Join-Path $PSScriptRoot "backup"
    if (!(Test-Path $backupFolder)) {
        New-Item -ItemType Directory -Path $backupFolder | Out-Null
    }

    $tanggal = Get-Date -Format "yyyy-MM-dd_HH-mm"

    foreach ($db in $dbList) {
        $file = "$backupFolder\${db}_$tanggal.sql"
        Write-Host ""
        Write-Host "Backup $db..." -ForegroundColor Yellow
        & $mysqldump @authArgs $db | Out-File -FilePath $file -Encoding utf8
        if ($LASTEXITCODE -eq 0) {
            $size = [math]::Round((Get-Item $file).Length / 1KB, 2)
            Write-Host "Berhasil: $file ($size KB)" -ForegroundColor Green
        } else {
            Write-Host "Backup $db GAGAL!" -ForegroundColor Red
        }
    }

    Write-Host ""
    Pause
}

# ==========================
# USER MANAGEMENT
# ==========================

function Create-Superuser {
    Show-Header
    Write-Host "  BUAT SUPERUSER DJANGO" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Akun ini untuk akses /admin panel saja." -ForegroundColor Yellow
    Write-Host "  Jangan dipakai login di aplikasi sehari-hari." -ForegroundColor Yellow
    Write-Host ""

    $selected = Select-Database
    if (!$selected) { return }

    $python = Get-VenvPython
    if (!$python) { return }

    $env:DJANGO_ENV = $selected.env

    Write-Host ""
    Write-Host "Target DB: $($selected.db)" -ForegroundColor DarkGray
    Write-Host ""

    & $python "$PSScriptRoot\backend\manage.py" createsuperuser

    Write-Host ""
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Superuser berhasil dibuat." -ForegroundColor Green
    } else {
        Write-Host "Gagal membuat superuser." -ForegroundColor Red
    }

    Pause
}

function Create-AppUser {
    Show-Header
    Write-Host "  BUAT USER APLIKASI" -ForegroundColor Cyan
    Write-Host ""

    $selected = Select-Database
    if (!$selected) { return }

    $python = Get-VenvPython
    if (!$python) { return }

    $env:DJANGO_ENV = $selected.env

    Write-Host ""
    Write-Host "Target DB: $($selected.db)" -ForegroundColor DarkGray
    Write-Host ""

    # Input username
    $username = Read-Host "Username"
    if (!$username) {
        Write-Host "Username tidak boleh kosong." -ForegroundColor Red
        Pause
        return
    }

    # Input password
    $password = Read-Host "Password (min 6 karakter)"
    if ($password.Length -lt 6) {
        Write-Host "Password minimal 6 karakter." -ForegroundColor Red
        Pause
        return
    }

    # Input nama
    $firstName = Read-Host "Nama Depan (opsional)"
    $lastName  = Read-Host "Nama Belakang (opsional)"
    $email     = Read-Host "Email (opsional)"

    # Pilih role
    Write-Host ""
    Write-Host "Pilih Role:"
    Write-Host "[1] karyawan"
    Write-Host "[2] kepala_seksi"
    Write-Host "[3] manajer"
    Write-Host "[4] wakil_direktur"
    Write-Host "[5] direktur"
    Write-Host ""
    $pilihanRole = Read-Host "Pilih"

    $role = switch ($pilihanRole) {
        "1" { "karyawan" }
        "2" { "kepala_seksi" }
        "3" { "manajer" }
        "4" { "wakil_direktur" }
        "5" { "direktur" }
        default { "karyawan" }
    }

    # Flag akses
    Write-Host ""
    Write-Host "Flag Akses (Y/N):"
    $isKeuangan      = (Read-Host "is_keuangan (akses modul keuangan)") -ieq "Y"
    $isPettyCash     = (Read-Host "is_petty_cash_cashier (kasir petty cash)") -ieq "Y"
    $isIT            = (Read-Host "is_it (akses modul IT)") -ieq "Y"
    $isDriver        = (Read-Host "is_driver (akses modul kendaraan)") -ieq "Y"

    # Konfirmasi
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  Ringkasan User Baru" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  Username       : $username"
    Write-Host "  Nama           : $firstName $lastName"
    Write-Host "  Email          : $email"
    Write-Host "  Role           : $role"
    Write-Host "  is_keuangan    : $isKeuangan"
    Write-Host "  is_petty_cash  : $isPettyCash"
    Write-Host "  is_it          : $isIT"
    Write-Host "  is_driver      : $isDriver"
    Write-Host "  Target DB      : $($selected.db)"
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""

    $konfirmasi = Read-Host "Buat user ini? (Y/N)"
    if ($konfirmasi -ine "Y") { return }

    # Build Python script inline
    $script = @"
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()

if User.objects.filter(username='$username').exists():
    print('ERROR: Username sudah dipakai.')
    exit(1)

user = User.objects.create_user(
    username='$username',
    password='$password',
    first_name='$firstName',
    last_name='$lastName',
    email='$email',
    role='$role',
    is_keuangan=$( if ($isKeuangan) { "True" } else { "False" } ),
    is_petty_cash_cashier=$( if ($isPettyCash) { "True" } else { "False" } ),
    is_it=$( if ($isIT) { "True" } else { "False" } ),
    is_driver=$( if ($isDriver) { "True" } else { "False" } ),
    is_active=True,
)
print(f'OK User {user.username} berhasil dibuat (ID: {user.id})')
"@

    Write-Host ""
    Push-Location "$PSScriptRoot\backend"
    $script | & $python
    Pop-Location

    Write-Host ""
    if ($LASTEXITCODE -eq 0) {
        Write-Host "User aplikasi berhasil dibuat." -ForegroundColor Green
    } else {
        Write-Host "Gagal membuat user." -ForegroundColor Red
    }

    Pause
}

function Export-Project {
    Show-Header
    Write-Host "  EXPORT PROJECT (ZIP)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Folder yang di-skip:" -ForegroundColor DarkGray
    Write-Host "  node_modules, dist, __pycache__, staticfiles," -ForegroundColor DarkGray
    Write-Host "  media, .venv, .git, backup, .env.development" -ForegroundColor DarkGray
    Write-Host ""

    $outputFolder = Join-Path $PSScriptRoot "export"
    if (!(Test-Path $outputFolder)) {
        New-Item -ItemType Directory -Path $outputFolder | Out-Null
    }

    $tanggal = Get-Date -Format "yyyy-MM-dd_HH-mm"
    $zipName = "simak_export_$tanggal.zip"
    $zipPath = Join-Path $outputFolder $zipName

    # Baca skipList dari .gitignore
    $skipList = @(".git", "export")
    $gitignorePath = Join-Path $PSScriptRoot ".gitignore"
    if (Test-Path $gitignorePath) {
        Get-Content $gitignorePath | ForEach-Object {
            $line = $_.Trim()
            if ($line -and !$line.StartsWith("#") -and !$line.StartsWith("!")) {
                $skipList += $line.TrimEnd("/").TrimEnd("\")
            }
        }
        Write-Host ".gitignore ditemukan, $($skipList.Count) pattern dimuat." -ForegroundColor DarkGray
    } else {
        Write-Host ".gitignore tidak ditemukan, pakai default skip list." -ForegroundColor Yellow
    }

    Write-Host "Mengumpulkan file..." -ForegroundColor Yellow

    $files = Get-ChildItem -Path $PSScriptRoot -Recurse -File | Where-Object {
        $path     = $_.FullName
        $relative = $path.Substring($PSScriptRoot.Length + 1)
        $skip     = $false
        foreach ($s in $skipList) {
            if ($relative -like "$s\*" -or $relative -like "*\$s\*" -or
                $relative -like "*\$s"  -or $_.Name -eq $s) {
                $skip = $true
                break
            }
        }
        -not $skip
    }

    Write-Host "Total file: $($files.Count)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Membuat ZIP..." -ForegroundColor Yellow

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, "Create")

    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($PSScriptRoot.Length + 1)
        try {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $file.FullName, $relativePath,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        } catch {
            Write-Host "Skip: $relativePath" -ForegroundColor DarkGray
        }
    }

    $zip.Dispose()

    $sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Export selesai!" -ForegroundColor Green
    Write-Host "  File : $zipPath" -ForegroundColor Green
    Write-Host "  Size : $sizeMB MB" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Langkah selanjutnya di server tujuan:" -ForegroundColor Yellow
    Write-Host "  1. Extract ZIP ke folder project" -ForegroundColor Yellow
    Write-Host "  2. Jalankan RUN_APP.bat" -ForegroundColor Yellow
    Write-Host "  3. Pilih [18] Setup Awal (venv + requirements + npm)" -ForegroundColor Yellow
    Write-Host "  4. Pilih [7]  Setup Database (Buat DB + Migrate)" -ForegroundColor Yellow
    Write-Host "  5. Pilih [10] Build Frontend" -ForegroundColor Yellow
    Write-Host "  6. Pilih [11] Collect Static" -ForegroundColor Yellow
    Write-Host "  7. Pilih [12] Buat Superuser" -ForegroundColor Yellow
    Write-Host "  8. Pilih [2]  Jalankan Production" -ForegroundColor Yellow
    Write-Host ""

    Pause
}

function Setup-Awal {
    Show-Header
    Write-Host "  SETUP AWAL SERVER" -ForegroundColor Cyan
    Write-Host ""

    # ==========================
    # CEK PYTHON
    # ==========================
    Write-Host "Cek Python..." -ForegroundColor Yellow
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if (!$pythonCmd) {
        Write-Host "Python tidak ditemukan! Install Python dulu." -ForegroundColor Red
        Pause
        return
    }
    $pythonVer = & python --version 2>&1
    Write-Host "OK $pythonVer" -ForegroundColor Green

    # ==========================
    # CEK NODE
    # ==========================
    Write-Host "Cek Node.js..." -ForegroundColor Yellow
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (!$nodeCmd) {
        Write-Host "Node.js tidak ditemukan! Install Node.js dulu." -ForegroundColor Red
        Pause
        return
    }
    $nodeVer = & node --version 2>&1
    Write-Host "OK Node.js $nodeVer" -ForegroundColor Green

    # ==========================
    # BUAT VENV
    # ==========================
    Write-Host ""
    $venvPath = Join-Path $PSScriptRoot ".venv"
    if (Test-Path $venvPath) {
        Write-Host "Virtual environment sudah ada, skip." -ForegroundColor DarkGray
    } else {
        Write-Host "Membuat virtual environment..." -ForegroundColor Yellow
        & python -m venv $venvPath
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Gagal membuat virtual environment!" -ForegroundColor Red
            Pause
            return
        }
        Write-Host "OK Virtual environment dibuat." -ForegroundColor Green
    }

    # ==========================
    # INSTALL REQUIREMENTS
    # ==========================
    $python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
    $reqFile = Join-Path $PSScriptRoot "requirements.txt"

    Write-Host ""
    if (!(Test-Path $reqFile)) {
        Write-Host "requirements.txt tidak ditemukan, skip install." -ForegroundColor Yellow
    } else {
        Write-Host "Install Python requirements..." -ForegroundColor Yellow
        & $python -m pip install --upgrade pip | Out-Null
        & $python -m pip install -r $reqFile
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Gagal install requirements!" -ForegroundColor Red
            Pause
            return
        }
        Write-Host "OK Requirements terinstall." -ForegroundColor Green
    }

    # ==========================
    # INSTALL NPM
    # ==========================
    Write-Host ""
    $frontendPath = Join-Path $PSScriptRoot "frontend"
    if (!(Test-Path $frontendPath)) {
        Write-Host "Folder frontend tidak ditemukan, skip npm install." -ForegroundColor Yellow
    } else {
        Write-Host "Install npm packages..." -ForegroundColor Yellow
        Set-Location $frontendPath
        npm install
        Set-Location $PSScriptRoot
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Gagal npm install!" -ForegroundColor Red
            Pause
            return
        }
        Write-Host "OK npm packages terinstall." -ForegroundColor Green
    }

    # ==========================
    # TAWARKAN LANJUT SETUP DB
    # ==========================
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Setup awal selesai!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Langkah selanjutnya yang tersedia:" -ForegroundColor Yellow
    Write-Host "  [7]  Setup Database (Buat DB + Migrate)" -ForegroundColor Yellow
    Write-Host "  [10] Build Frontend" -ForegroundColor Yellow
    Write-Host "  [11] Collect Static" -ForegroundColor Yellow
    Write-Host "  [12] Buat Superuser" -ForegroundColor Yellow
    Write-Host "  [13] Buat User Aplikasi" -ForegroundColor Yellow
    Write-Host ""

    $jawab = Read-Host "Jalankan Setup Database sekarang? (Y/N)"
    if ($jawab -ieq "Y") {
        Setup-Database
    }

    Pause
}

function Sync-RemoteDatabase {
    Show-Header
    Write-Host "  SYNC DATABASE DARI SERVER (192.168.44.116)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Menyalin data terbaru dari server 192.168.44.116..." -ForegroundColor Yellow
    Write-Host ""

    Write-Host "Pilih Database yang akan di-sync:"
    Write-Host "[1] rssams (Legacy SIMRS - Ukuran Besar ~5-8 menit)"
    Write-Host "[2] simak  (Production SIMAK - Cepat ~10-20 detik)"
    Write-Host "[3] Keduanya (rssams & simak)"
    Write-Host "[0] Batal"
    Write-Host ""
    $pilihan = Read-Host "Pilih"

    $dbList = @()
    switch ($pilihan) {
        "1" { $dbList = @("rssams") }
        "2" { $dbList = @("simak") }
        "3" { $dbList = @("simak", "rssams") }
        "0" { return }
        default {
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
            return
        }
    }

    $remoteHost = "192.168.44.116"
    $remoteUser = "itrssams"
    $remotePass = "IT@rssams2025"

    Write-Host ""
    Write-Host "Pilih Target Tujuan Sinkronisasi:"
    Write-Host "[1] Container Docker (shared-mysql-rssams) - Direkomendasikan"
    Write-Host "[2] MySQL Local (XAMPP / Service Local)"
    Write-Host "[0] Batal"
    Write-Host ""
    $targetDest = Read-Host "Pilih"
    if ($targetDest -eq "0" -or ($targetDest -ne "1" -and $targetDest -ne "2")) { return }

    $origErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        foreach ($db in $dbList) {
            Write-Host ""
            Write-Host "==========================================" -ForegroundColor Cyan
            Write-Host "  Sync database '$db' dari $remoteHost..." -ForegroundColor Yellow
            Write-Host "==========================================" -ForegroundColor Cyan
            
            if ($db -eq "rssams") {
                Write-Host "Catatan: Database 'rssams' berukuran besar, proses transfer membutuhkan beberapa menit..." -ForegroundColor DarkGray
            }
            
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

            if ($targetDest -eq "1") {
                Write-Host "Streaming langsung di dalam container Docker shared-mysql-rssams..." -ForegroundColor DarkGray
                
                # Buat database jika belum ada di docker
                docker exec shared-mysql-rssams mysql -u root -proot -e "CREATE DATABASE IF NOT EXISTS \`$db\`;" 2>$null | Out-Null
                
                # Stream mysqldump langsung ke mysql di dalam container
                $dockerCmd = "mysqldump -h $remoteHost -u $remoteUser -p'$remotePass' --single-transaction --quick --skip-column-statistics $db 2>/dev/null | mysql -u root -proot --force $db 2>/dev/null"
                docker exec shared-mysql-rssams sh -c $dockerCmd
                $res = $LASTEXITCODE
            } else {
                Write-Host "Streaming ke MySQL Local..." -ForegroundColor DarkGray
                $creds = Get-DbCredentials
                $mysqlLocal = Get-MySQLBinPath "mysql.exe"
                $mysqldump = Get-MySQLBinPath "mysqldump.exe"
                if (!$mysqldump) { $mysqldump = "mysqldump" }
                if (!$mysqlLocal) { $mysqlLocal = "mysql" }
                
                $passArg = if ($creds.password) { "-p$($creds.password)" } else { "" }
                
                # Buat database jika belum ada di local
                & $mysqlLocal -h $($creds.host) -u $($creds.user) $passArg -e "CREATE DATABASE IF NOT EXISTS \`$db\`;" 2>$null | Out-Null
                
                $cmd = "& '$mysqldump' -h $remoteHost -u $remoteUser -p'$remotePass' --single-transaction --quick --skip-column-statistics $db 2>`$null | & '$mysqlLocal' -h $($creds.host) -u $($creds.user) $passArg --force $db 2>`$null"
                Invoke-Expression $cmd
                $res = $LASTEXITCODE
            }

            $stopwatch.Stop()
            $elapsedSeconds = [math]::Round($stopwatch.Elapsed.TotalSeconds, 1)

            if ($res -eq 0) {
                Write-Host "OK Database '$db' berhasil disinkronkan ($elapsedSeconds detik)." -ForegroundColor Green
            } else {
                Write-Host "Peringatan: Sync '$db' selesai dengan kode $res ($elapsedSeconds detik)." -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "Terjadi kesalahan saat sinkronisasi: $_" -ForegroundColor Red
    } finally {
        $ErrorActionPreference = $origErrorAction
    }

    Write-Host ""
    Write-Host "Proses sinkronisasi selesai!" -ForegroundColor Green
    Write-Host ""
    Pause
}

# ==========================
# MAIN MENU
# ==========================

while ($true) {
    Show-Header

    Write-Host "--- Server ---" -ForegroundColor DarkGray
    Write-Host "[1]  Jalankan Development"
    Write-Host "[2]  Jalankan Production"
    Write-Host "[3]  Stop Development"
    Write-Host "[4]  Stop Production"
    Write-Host "[5]  Restart Development"
    Write-Host "[6]  Restart Production"
    Write-Host ""
    Write-Host "--- Database & Build ---" -ForegroundColor DarkGray
    Write-Host "[7]  Setup Database (Buat DB + Migrate)"
    Write-Host "[8]  Migrate Database"
    Write-Host "[9]  Migrasi Invoice dari RSSAMS"
    Write-Host "[10] Build Frontend"
    Write-Host "[11] Collect Static"
    Write-Host ""
    Write-Host "--- User ---" -ForegroundColor DarkGray
    Write-Host "[12] Buat Superuser (Admin Panel)"
    Write-Host "[13] Buat User Aplikasi"
    Write-Host ""
    Write-Host "--- Maintenance & Sync ---" -ForegroundColor DarkGray
    Write-Host "[14] Update Aplikasi"
    Write-Host "[15] Backup Database"
    Write-Host "[16] Cek Status Server"
    Write-Host "[17] Export Project (ZIP untuk pindah server)"
    Write-Host "[18] Setup Awal (venv + requirements + npm)"
    Write-Host "[19] Sync Data Terbaru dari Server Remote (192.168.44.116)"
    Write-Host ""
    Write-Host "[0]  Keluar"
    Write-Host ""

    $choice = Read-Host "Pilih Menu"

    switch ($choice) {
        "1"  { Start-Development }
        "2"  { Start-Production }
        "3"  { Stop-Development }
        "4"  { Stop-Production }
        "5"  { Restart-Development }
        "6"  { Restart-Production }
        "7"  { Setup-Database }
        "8"  { Run-Migrate }
        "9"  { Run-MigrasiInvoice }
        "10" { Run-Build }
        "11" { Run-CollectStatic }
        "12" { Create-Superuser }
        "13" { Create-AppUser }
        "14" { Run-Update }
        "15" { Run-Backup }
        "16" { Show-Status }
        "17" { Export-Project }
        "18" { Setup-Awal }
        "19" { Sync-RemoteDatabase }
        "0"  { exit }
        default {
            Write-Host ""
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
        }
    }
}