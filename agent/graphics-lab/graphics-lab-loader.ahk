#Requires AutoHotkey v2.0
#SingleInstance Force
SetTitleMatchMode 2
CoordMode "Mouse", "Client"

if A_Args.Length < 1 {
    MsgBox "No artwork path was supplied."
    ExitApp 2
}

artworkPath := A_Args[1]
configPath := A_ScriptDir "\graphics-lab.ini"

if !FileExist(artworkPath) {
    MsgBox "Artwork file not found:`n" artworkPath
    ExitApp 3
}

if !FileExist(configPath) {
    MsgBox "Run CALIBRATE-GRAPHICS-LAB.cmd first."
    ExitApp 4
}

windowTitle := IniRead(configPath, "GraphicsLab", "WindowTitle", "GTX Graphics Lab")
addImageX := Integer(IniRead(configPath, "GraphicsLab", "AddImageX", "0"))
addImageY := Integer(IniRead(configPath, "GraphicsLab", "AddImageY", "0"))

if !WinExist(windowTitle) {
    MsgBox "Open GTX Graphics Lab first."
    ExitApp 5
}

WinActivate windowTitle
if !WinWaitActive(windowTitle, , 8) {
    MsgBox "Could not activate GTX Graphics Lab."
    ExitApp 6
}

Sleep 500
Click addImageX, addImageY

if !WinWaitActive("ahk_class #32770", , 12) {
    MsgBox "The Windows Open dialog did not appear. Recalibrate the Add Image button."
    ExitApp 7
}

Sleep 300
Send "!n"
Sleep 200
SendText artworkPath
Sleep 200
Send "{Enter}"

if !WinWaitClose("ahk_class #32770", , 12) {
    MsgBox "The file dialog did not close."
    ExitApp 8
}

ExitApp 0
