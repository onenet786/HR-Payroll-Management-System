@echo off
setlocal

if not exist "%~dp0bin\URU4500Bridge.exe" (
  call "%~dp0build.bat" || exit /b 1
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\URU4500Bridge.bat"

if not exist "%STARTUP%" mkdir "%STARTUP%"

(
  echo @echo off
  echo taskkill /IM URU4500Bridge.exe /F ^>nul 2^>^&1
  echo cd /d "%~dp0bin"
  echo start "URU4500Bridge" /min "%~dp0bin\URU4500Bridge.exe"
) > "%TARGET%"

call "%TARGET%"

echo.
echo URU4500Bridge startup entry installed:
echo %TARGET%
echo It will run automatically when this Windows user logs in.
echo Endpoint: ws://127.0.0.1:15896
