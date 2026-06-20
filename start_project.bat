@echo off
echo ==========================================
echo    Arch/C Scraping - Project Starter
echo ==========================================
echo.

echo [*] Starting FastAPI Backend on Port 8080...
start "Arch/C Backend" cmd /k "cd backend && .\venv\Scripts\activate && uvicorn main:app --reload --port 8080"

echo [*] Starting Vite Frontend on Port 5173...
start "Arch/C Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ==========================================
echo [+] Sunucular ayri pencerelerde baslatiliyor...
echo [+] Bu pencereyi kapatabilirsiniz.
echo ==========================================
timeout /t 3 >nul
