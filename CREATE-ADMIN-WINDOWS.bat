@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or later is required.
  pause
  exit /b 1
)
if not exist .env (
  echo Missing .env. Copy .env.example to .env and set ADMIN_EMAIL and ADMIN_PASSWORD first.
  pause
  exit /b 1
)
node scripts\create-admin.js
pause
