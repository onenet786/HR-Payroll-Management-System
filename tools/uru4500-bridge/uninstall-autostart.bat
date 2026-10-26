@echo off
setlocal
rem Removes the URU4500Bridge login auto-start (run as Administrator to remove the all-users entry too).

reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v URU4500Bridge /f >nul 2>&1
net session >nul 2>&1
if not errorlevel 1 reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v URU4500Bridge /f >nul 2>&1
taskkill /IM URU4500Bridge.exe /F >nul 2>&1

echo.
echo URU4500Bridge auto-start removed.
