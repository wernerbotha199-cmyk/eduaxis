@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo EDUAXIS - NETLIFY DEPLOYMENT
echo ================================================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20 LTS or newer first.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing deployment tools and database driver...
  call npm install
  if errorlevel 1 goto failed
)
if not exist .netlify\state.json (
  echo First-time setup: this will open Netlify authorization in your browser.
  call npx netlify login
  if errorlevel 1 goto failed
  call npx netlify link
  if errorlevel 1 goto failed
)
echo Deploying website and serverless API functions...
call npx netlify deploy --prod
if errorlevel 1 goto failed
echo.
echo Deployment command completed. Open your Netlify site and test /api/health.
pause
exit /b 0
:failed
echo.
echo Deployment stopped. Read the error above, correct it, then run this file again.
pause
exit /b 1
