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
set /p "ARTFILE=Paste the full PNG path: "
if not exist "%ARTFILE%" (
 echo File not found: %ARTFILE%
 pause
 exit /b 1
)
"%AHK%" "%~dp0agent\graphics-lab\graphics-lab-loader.ahk" "%ARTFILE%"
if errorlevel 1 (
 echo Test failed.
) else (
 echo SUCCESS: Artwork was imported through Add Image.
)
pause
