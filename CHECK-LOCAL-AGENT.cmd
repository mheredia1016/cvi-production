@echo off
setlocal
cd /d "%~dp0"
title ProductionOS Agent Diagnostics
call npm.cmd run agent:diagnose
echo.
pause
