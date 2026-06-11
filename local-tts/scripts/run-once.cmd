@echo off
setlocal

set "ROOT=%~dp0.."
cd /d "%ROOT%"

if not exist "logs" mkdir "logs"
set "PYTHONIOENCODING=utf-8"

echo.>>"logs\batch.log"
echo ===== %DATE% %TIME% =====>>"logs\batch.log"
".venv\Scripts\python.exe" "generate_pronunciations.py" >>"logs\batch.log" 2>&1
exit /b %ERRORLEVEL%
