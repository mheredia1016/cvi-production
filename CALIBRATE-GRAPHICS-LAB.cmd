@echo off
setlocal
set "AHK="
if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe" set "AHK=C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"
if exist "%LocalAppData%\Programs\AutoHotkey\v2\AutoHotkey64.exe" set "AHK=%LocalAppData%\Programs\AutoHotkey\v2\AutoHotkey64.exe"
if not defined AHK (
 echo AutoHotkey v2 was not found.
 echo Install AutoHotkey v2 and run this again.
 pause
 exit /b 1
)
cd /d "%~dp0"
"%AHK%" "%~dp0agent\graphics-lab\calibrate-graphics-lab.ahk"
pause
