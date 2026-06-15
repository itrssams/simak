@echo off
title SIMAK - Migrasi Invoice
color 0A

set DB_TARGET=simak_dev
set DJANGO_ENV=development

:MENU
cls

echo ==========================================
echo       MIGRASI INVOICE RSSAMS
echo ==========================================
echo.
echo  Target DB saat ini : %DB_TARGET%
echo.
echo [1] Dry Run - Simulasi (tidak menyimpan)
echo [2] Jalankan Migrasi
echo [3] Ganti Target DB
echo [0] Keluar
echo.

set /p pilihan=Pilih menu :

if "%pilihan%"=="1" goto DRYRUN
if "%pilihan%"=="2" goto CONFIRM
if "%pilihan%"=="3" goto GANTI_DB
if "%pilihan%"=="0" exit

echo.
echo Pilihan tidak valid.
timeout /t 2 >nul
goto MENU

:GANTI_DB
cls
echo ==========================================
echo         PILIH TARGET DATABASE
echo ==========================================
echo.
echo [1] simak_dev (Development)
echo [2] simak     (Production)
echo [0] Batal
echo.
set /p pilihandb=Pilih :

if "%pilihandb%"=="1" (
    set DB_TARGET=simak_dev
    set DJANGO_ENV=development
    echo Target DB diubah ke simak_dev
    timeout /t 2 >nul
    goto MENU
)
if "%pilihandb%"=="2" (
    set DB_TARGET=simak
    set DJANGO_ENV=production
    echo Target DB diubah ke simak
    timeout /t 2 >nul
    goto MENU
)
if "%pilihandb%"=="0" goto MENU

echo Pilihan tidak valid.
timeout /t 2 >nul
goto GANTI_DB

:DRYRUN
cls
echo ==========================================
echo    DRY RUN - Target DB: %DB_TARGET%
echo ==========================================
echo.
set DJANGO_ENV=%DJANGO_ENV%
.\.venv\Scripts\python.exe backend\manage.py migrate_invoices_from_rssams --dry-run
pause
goto MENU

:CONFIRM
cls
echo ==========================================
echo   KONFIRMASI MIGRASI
echo ==========================================
echo.
echo  Target DB : %DB_TARGET%
echo.

if "%DB_TARGET%"=="simak" (
    echo  PERINGATAN: Anda akan migrasi ke database PRODUCTION!
    echo.
)

set /p konfirmasi=Ketik Y untuk lanjut :

if /I not "%konfirmasi%"=="Y" goto MENU

:MIGRATE
cls
echo ==========================================
echo    MIGRASI - Target DB: %DB_TARGET%
echo ==========================================
echo.
set DJANGO_ENV=%DJANGO_ENV%
.\.venv\Scripts\python.exe backend\manage.py migrate_invoices_from_rssams
pause
goto MENU