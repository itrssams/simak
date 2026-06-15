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
        if ($conn) {
            return ($conn | Select-Object -First 1).OwningProcess
        }
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

function Activate-Venv {
    $venv = Join-Path $PSScriptRoot ".venv\Scripts\Activate.ps1"
    if (!(Test-Path $venv)) {
        Write-Host ""
        Write-Host "Virtual Environment tidak ditemukan!" -ForegroundColor Red
        Write-Host $venv
        Pause
        exit
    }
    & $venv
}

function Select-Database {
    Write-Host ""
    Write-Host "Pilih Target Database:" -ForegroundColor Cyan
    Write-Host "[1] simak_dev (Development)"
    Write-Host "[2] simak     (Production)"
    Write-Host "[0] Batal"
    Write-Host ""
    $pilihan = Read-Host "Pilih"

    switch ($pilihan) {
        "1" { return @{ db = "simak_dev"; env = "development" } }
        "2" { return @{ db = "simak";     env = "production"  } }
        "0" { return $null }
        default {
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
            return $null
        }
    }
}

function Start-Development {
    Show-Header

    if (Test-Port 8000 -or Test-Port 5173) {
        Write-Host "Development sudah berjalan." -ForegroundColor Yellow
        Write-Host ""
        $jawab = Read-Host "Restart Development? (Y/N)"
        if ($jawab -ieq "Y") {
            Stop-PortProcess 8000
            Stop-PortProcess 5173
        } else {
            return
        }
    }

    Write-Host ""
    Write-Host "Menjalankan Backend..." -ForegroundColor Green
    Start-Process powershell `
        -ArgumentList "-NoExit","-Command","cd '$PSScriptRoot\backend'; & '$PSScriptRoot\.venv\Scripts\python.exe' manage.py runserver 0.0.0.0:8000"

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
        } else {
            Pause
            return
        }
    }

    Activate-Venv

    Set-Location "$PSScriptRoot\backend"

    Write-Host ""
    Write-Host "Menjalankan Waitress..." -ForegroundColor Green
    Write-Host ""

    python -m waitress --listen=0.0.0.0:8900 config.wsgi:application
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

function Run-Migrate {
    Show-Header
    Write-Host "  MIGRASI DATABASE DJANGO" -ForegroundColor Cyan
    Write-Host ""

    $selected = Select-Database
    if (!$selected) { return }

    $python = Get-VenvPython
    if (!$python) { return }

    if ($selected.db -eq "simak") {
        Write-Host ""
        Write-Host "  PERINGATAN: Migrasi ke database PRODUCTION!" -ForegroundColor Red
        Write-Host ""
        $konfirmasi = Read-Host "Ketik Y untuk lanjut"
        if ($konfirmasi -ine "Y") { return }
    }

    Write-Host ""
    Write-Host "Menjalankan migrate ke $($selected.db)..." -ForegroundColor Yellow
    Write-Host ""

    $env:DJANGO_ENV = $selected.env
    & $python "$PSScriptRoot\backend\manage.py" migrate

    Write-Host ""
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Migrate ke $($selected.db) berhasil." -ForegroundColor Green
    } else {
        Write-Host "Migrate gagal. Cek output di atas." -ForegroundColor Red
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
        Write-Host "Build frontend berhasil." -ForegroundColor Green
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

# ==========================
# MAIN MENU
# ==========================

while ($true) {
    Show-Header

    Write-Host "--- Server ---" -ForegroundColor DarkGray
    Write-Host "[1] Jalankan Development"
    Write-Host "[2] Jalankan Production"
    Write-Host "[3] Stop Development"
    Write-Host "[4] Stop Production"
    Write-Host "[5] Restart Development"
    Write-Host "[6] Restart Production"
    Write-Host ""
    Write-Host "--- Django ---" -ForegroundColor DarkGray
    Write-Host "[7] Migrate Database"
    Write-Host "[8] Build Frontend"
    Write-Host "[9] Collect Static"
    Write-Host ""
    Write-Host "[0] Keluar"
    Write-Host ""

    $choice = Read-Host "Pilih Menu"

    switch ($choice) {
        "1" { Start-Development }
        "2" { Start-Production }
        "3" { Stop-Development }
        "4" { Stop-Production }
        "5" { Restart-Development }
        "6" { Restart-Production }
        "7" { Run-Migrate }
        "8" { Run-Build }
        "9" { Run-CollectStatic }
        "0" { exit }
        default {
            Write-Host ""
            Write-Host "Pilihan tidak valid." -ForegroundColor Red
            Start-Sleep -Seconds 2
        }
    }
}