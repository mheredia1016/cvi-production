#Requires AutoHotkey v2.0
#SingleInstance Force
SetTitleMatchMode 2
CoordMode "Mouse", "Client"

windowTitle := "GTX Graphics Lab"
configPath := A_ScriptDir "\graphics-lab.ini"

if !WinExist(windowTitle) {
    MsgBox "Open GTX Graphics Lab first."
    ExitApp 2
}

WinActivate windowTitle
WinWaitActive windowTitle, , 8
MsgBox "Move the mouse over the center of Add Image, then press F8."
KeyWait "F8", "D"
MouseGetPos &x, &y

IniWrite windowTitle, configPath, "GraphicsLab", "WindowTitle"
IniWrite x, configPath, "GraphicsLab", "AddImageX"
IniWrite y, configPath, "GraphicsLab", "AddImageY"

MsgBox "Calibration saved.`nX: " x "`nY: " y
ExitApp 0
