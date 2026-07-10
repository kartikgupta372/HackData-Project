@echo off
title Aura Design AI - Startup
color 0A
echo.
echo  =========================================
echo   Aura Design AI - Starting All Services
echo  =========================================
echo.

echo [1/3] Clearing ports 3002 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3002" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/3] Starting Backend on http://localhost:3002 ...
cd /d "%~dp0backend"
start "Aura Backend" cmd /k "node src/app.js"

timeout /t 4 /nobreak >nul

echo [3/3] Starting Frontend on http://localhost:5174 ...
cd /d "%~dp0frontend"
start "Aura Frontend" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul
echo.
echo  =========================================
echo   ? Backend  ? http://localhost:3002
echo   ? Frontend ? http://localhost:5174
echo  =========================================
echo.
echo  Opening browser...
start "" "http://localhost:5174"

echo.
echo  Both windows are now running.
echo  Close this window or press any key to exit.
pause >nul
