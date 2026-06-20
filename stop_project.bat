@echo off
echo ==========================================
echo    Arch/C Scraping - Safe Server Stopper
echo ==========================================
echo.

echo [*] Durduruluyor: Vite Frontend (Port 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do (
    if NOT "%%a"=="0" (
        echo Pid bulundu: %%a
        taskkill /F /PID %%a 2>nul
    )
)

echo.
echo [*] Durduruluyor: FastAPI Backend (Port 8080)...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8080" ^| find "LISTENING"') do (
    if NOT "%%a"=="0" (
        echo Pid bulundu: %%a
        taskkill /F /PID %%a 2>nul
    )
)

echo.
echo ==========================================
echo [+] Secili servisler basariyla durduruldu!
echo ==========================================
pause
