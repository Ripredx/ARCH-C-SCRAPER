@echo off
echo ==========================================
echo    Arch/C Scraping - Auto Installer
echo ==========================================
echo.

echo [*] Adim 1: Backend (Python) sanal ortami kuruluyor...
cd backend
python -m venv venv

echo [*] Adim 2: Backend bagimliliklari ve Playwright indiriliyor (Bu islem biraz surebilir)...
call .\venv\Scripts\activate.bat
pip install -r requirements.txt
playwright install
cd ..

echo [*] Adim 3: Frontend (Node.js) bagimliliklari kuruluyor...
cd frontend
call npm install
cd ..

echo.
echo ==========================================
echo [+] Tum kurulumlar basariyla tamamlandi!
echo [+] Artik projeyi baslatmak icin 'start_project.bat' dosyasina tiklayabilirsiniz.
echo ==========================================
pause
