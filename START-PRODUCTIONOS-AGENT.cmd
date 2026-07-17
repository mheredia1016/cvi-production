@echo off
setlocal
cd /d "%~dp0"
title ProductionOS Local Agent
call npm.cmd run agent
if errorlevel 1 (
  echo.
  echo The agent stopped with an error.
  pause
)
