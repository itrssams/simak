$ErrorActionPreference = "Stop"

Clear-Host

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "         BACKUP DATABASE SIMAK" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# =========================
# CARI MYSQLDUMP
# =========================

$mysqldumpCandidates = @(
    "C:\xampp\mysql\bin\mysqldump.exe",
    "D:\xampp\mysql\bin\mysqldump.exe",
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe",
    "C:\Program Files\MySQL\MySQL Server 5.7\bin\mysqldump.exe"
)

$mysqldump = $null
foreach ($candidate in $mysqldumpCandidates) {
    if (Test-Path $candidate) {
        $mysqldump = $candidate
        break
    }
}

if (!$mysqldump) {
    # Coba dari PATH
    $fromPath = Get-Command mysqldump -ErrorAction SilentlyContinue
    if ($fromPath) {
        $mysqldump = $fromPath.Source
    }
}

if (!$mysqldump) {
    Write-Host "mysqldump tidak ditemukan!" -ForegroundColor Red
    Write-Host "Pastikan XAMPP/MySQL sudah terinstall." -ForegroundColor Yellow
    Pause
    exit
}

Write-Host "mysqldump ditemukan: $mysqldump" -ForegroundColor Green
Write-Host ""

# =========================
# PILIH DATABASE
# =========================

Write-Host "Pilih database yang akan dibackup:"
Write-Host "[1] simak (Production)"
Write-Host "[2] simak_dev (Development)"
Write-Host "[3] Keduanya"
Write-Host "[0] Batal"
Write-Host ""

$pilihan = Read-Host "Pilih"

$dbList = @()

switch ($pilihan) {
    "1" { $dbList = @("simak") }
    "2" { $dbList = @("simak_dev") }
    "3" { $dbList = @("simak", "simak_dev") }
    "0" { exit }
    default {
        Write-Host "Pilihan tidak valid." -ForegroundColor Red
        Pause
        exit
    }
}

# =========================
# BUAT FOLDER BACKUP
# =========================

$BackupFolder = Join-Path $PSScriptRoot "backup"

if (!(Test-Path $BackupFolder)) {
    New-Item -ItemType Directory -Path $BackupFolder | Out-Null
}

$Tanggal = Get-Date -Format "yyyy-MM-dd_HH-mm"

# =========================
# JALANKAN BACKUP
# =========================

foreach ($db in $dbList) {
    $FileBackup = "$BackupFolder\${db}_$Tanggal.sql"

    Write-Host ""
    Write-Host "Membackup $db..." -ForegroundColor Yellow

    & $mysqldump -u root $db | Out-File -FilePath $FileBackup -Encoding utf8

    if ($LASTEXITCODE -eq 0) {
        $size = [math]::Round((Get-Item $FileBackup).Length / 1KB, 2)
        Write-Host "Backup berhasil: $FileBackup ($size KB)" -ForegroundColor Green
    } else {
        Write-Host "Backup $db GAGAL!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Pause