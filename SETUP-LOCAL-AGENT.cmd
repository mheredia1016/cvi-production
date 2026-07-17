@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo ProductionOS Local Agent Setup
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo Install the current Node.js LTS version and run this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example.
  echo.
  echo Open the .env file and enter:
  echo   SERVER_URL
  echo   AGENT_TOKEN
  echo.
  notepad ".env"
) else (
  echo Existing .env file found. It was not replaced.
)

echo.
echo Installing local dependencies...
call npm.cmd install
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

if not exist "C:\ProductionOS\TestHotFolder" mkdir "C:\ProductionOS\TestHotFolder"
if not exist "C:\ProductionOS\DryRunJobs" mkdir "C:\ProductionOS\DryRunJobs"

echo.
echo Running diagnostics...
call npm.cmd run agent:diagnose
echo.
echo Setup finished. Review the diagnostic results above.
echo Run START-PRODUCTIONOS-AGENT.cmd to start the agent.
pause
