@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or later is required. Install it from https://nodejs.org/ then reopen this window.
  pause
  exit /b 1
)
if not exist .env (
  echo Missing .env file.
  echo Copy .env.example to .env and edit SESSION_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD first.
  pause
  exit /b 1
)
node --version
node server.js
pause
