@echo off
title VaidyaVaani Dev Server

echo ========================================
echo   VaidyaVaani - Starting Dev Servers
echo ========================================
echo.

:: Start Python FastAPI backend
echo [1/2] Starting Python FastAPI backend on port 8000...
start "VaidyaVaani Python API" cmd /k "cd /d %~dp0 && python python_backend/main.py"
timeout /t 2 >nul

:: Start Node.js Express + Vite frontend
echo [2/2] Starting Node.js / Vite frontend on port 5000...
start "VaidyaVaani Node Server" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ✅ Both servers starting:
echo    - Node.js  (Frontend + Express API): http://localhost:5000
echo    - Python   (FastAPI backend):        http://localhost:8000
echo    - API Docs (Swagger):                http://localhost:8000/docs
echo.
pause
