@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0run-app.ps1"
if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo Script berhenti dengan kode error: %errorlevel%
    echo ========================================================
    pause
)