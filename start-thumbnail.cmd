@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install Node.js, then try again.
  pause
  exit /b 1
)
node scripts\start-local.mjs --port 3004
pause
