@echo off
setlocal

set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\URU4500Bridge.bat"

if exist "%TARGET%" del "%TARGET%"
taskkill /IM URU4500Bridge.exe /F >nul 2>&1

echo.
echo URU4500Bridge startup folder entry removed.
