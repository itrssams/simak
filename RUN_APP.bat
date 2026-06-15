@echo off
title SIMAK Server Manager
color 0A

:MENU
cls

echo ==========================================
echo          SIMAK SERVER MANAGER
echo ==========================================
echo.
echo [1] Kelola Server (Dev / Production)
echo [2] Update Aplikasi
echo [3] Backup Database
echo [4] Cek Status Server
echo [5] Migrasi Invoice dari RSSAMS
echo [6] Buka Folder Project
echo.
echo [8] Setup Awal (Pertama Kali)
echo.
echo [0] Keluar
echo.

set /p choice=Pilih menu :

if "%choice%"=="1" goto RUN
if "%choice%"=="2" goto UPDATE
if "%choice%"=="3" goto BACKUP
if "%choice%"=="4" goto STATUS
if "%choice%"=="5" goto MIGRASI
if "%choice%"=="6" goto FOLDER
if "%choice%"=="8" goto SETUP
if "%choice%"=="0" goto END

echo.
echo Pilihan tidak valid.
timeout /t 2 >nul
goto MENU

:RUN
powershell -ExecutionPolicy Bypass -File "%~dp0run-app.ps1"
goto MENU

:UPDATE
if exist "%~dp0update-app.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0update-app.ps1"
) else (
    echo.
    echo update-app.ps1 tidak ditemukan.
    pause
)
goto MENU

:BACKUP
if exist "%~dp0backup-db.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0backup-db.ps1"
) else (
    echo.
    echo backup-db.ps1 tidak ditemukan.
    pause
)
goto MENU

:STATUS
if exist "%~dp0status-server.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0status-server.ps1"
) else (
    echo.
    echo status-server.ps1 tidak ditemukan.
    pause
)
goto MENU

:MIGRASI
if exist "%~dp0MIGRASI_INVOICE_MENU.bat" (
    call "%~dp0MIGRASI_INVOICE_MENU.bat"
) else (
    echo.
    echo MIGRASI_INVOICE_MENU.bat tidak ditemukan.
    pause
)
goto MENU

:FOLDER
start "" "%~dp0"
goto MENU

:SETUP
if exist "%~dp0setup.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
) else (
    echo.
    echo setup.ps1 tidak ditemukan.
    pause
)
goto MENU

:END
exit