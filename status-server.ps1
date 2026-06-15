$ErrorActionPreference = "SilentlyContinue"

Clear-Host

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "          STATUS SERVER SIMAK" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

function Test-Port {
    param([int]$Port)
    return $null -ne (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)
}

# =========================
# STATUS PORT
# =========================

if (Test-Port 8000) {
    Write-Host "Backend Dev      : RUNNING" -ForegroundColor Green
} else {
    Write-Host "Backend Dev      : STOPPED" -ForegroundColor Red
}

if (Test-Port 5173) {
    Write-Host "Frontend Dev     : RUNNING" -ForegroundColor Green
} else {
    Write-Host "Frontend Dev     : STOPPED" -ForegroundColor Red
}

if (Test-Port 8900) {
    Write-Host "Production       : RUNNING" -ForegroundColor Green
} else {
    Write-Host "Production       : STOPPED" -ForegroundColor Red
}

# =========================
# MYSQL
# =========================

$mysql = Get-Service -Name mysql* -ErrorAction SilentlyContinue | Select-Object -First 1

if ($mysql) {
    if ($mysql.Status -eq "Running") {
        Write-Host "MySQL            : RUNNING" -ForegroundColor Green
    } else {
        Write-Host "MySQL            : STOPPED" -ForegroundColor Red
    }
} else {
    Write-Host "MySQL            : TIDAK TERDETEKSI" -ForegroundColor Yellow
}

# =========================
# CPU
# =========================

$cpu = (Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples.CookedValue
Write-Host ("CPU Usage        : {0:N1}%" -f $cpu)

# =========================
# RAM
# =========================

$os = Get-CimInstance Win32_OperatingSystem
$totalRam = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeRam  = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$usedRam  = [math]::Round($totalRam - $freeRam, 2)
Write-Host ("RAM Usage        : {0} GB / {1} GB" -f $usedRam, $totalRam)

# =========================
# DISK
# =========================

$disk = Get-PSDrive C
$free = [math]::Round($disk.Free / 1GB, 2)
Write-Host ("Disk C: Free     : {0} GB" -f $free)

# =========================
# UPTIME
# =========================

$uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
Write-Host ("Server Uptime    : {0} Hari {1} Jam" -f $uptime.Days, $uptime.Hours)

# =========================
# GIT COMMIT
# =========================

if (Get-Command git -ErrorAction SilentlyContinue) {
    try {
        $commit = git rev-parse --short HEAD 2>$null
        Write-Host ("Git Version      : {0}" -f $commit)
    } catch {
        Write-Host "Git Version      : Tidak diketahui"
    }
}

# =========================
# LAST BACKUP
# =========================

if (Test-Path ".\backup") {
    $lastBackup = Get-ChildItem ".\backup" -Filter *.sql |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($lastBackup) {
        Write-Host ("Last Backup      : {0}" -f $lastBackup.LastWriteTime)
    } else {
        Write-Host "Last Backup      : Belum ada"
    }
} else {
    Write-Host "Last Backup      : Folder backup tidak ditemukan"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Pause